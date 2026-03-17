import { uploadToS3 } from "../api/listingApi";

const MAX_UPLOAD_CONCURRENCY = 4;
const MAX_UPLOAD_RETRIES = 2;
const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1920;
const JPEG_QUALITY = 0.82;
const MIN_COMPRESSION_CANDIDATE_BYTES = 300 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/jpg"]);

export function validateImageFiles(files) {
  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      throw new Error("JPG, PNG, WEBP, GIF 이미지 파일만 업로드할 수 있습니다.");
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      throw new Error("이미지 한 장의 최대 크기는 20MB입니다.");
    }
  }
}

export function normalizeUploadTargets(response) {
  const rawData = response?.data ?? response;
  const items = Array.isArray(rawData)
    ? rawData
    : (
      rawData?.files ??
      rawData?.uploadUrls ??
      rawData?.presignedUrls ??
      rawData?.items ??
      rawData?.urls ??
      []
    );
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    key: item?.key ?? item?.fileKey ?? item?.path ?? "",
    putUrl: item?.putUrl ?? item?.presignedPutUrl ?? item?.uploadUrl ?? item?.url ?? ""
  }));
}

function createResizedImageBlob(file, imageBitmap, nextWidth, nextHeight) {
  const canvas = document.createElement("canvas");
  canvas.width = nextWidth;
  canvas.height = nextHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("이미지 변환을 위한 캔버스를 초기화하지 못했습니다.");
  }

  context.drawImage(imageBitmap, 0, 0, nextWidth, nextHeight);

  const outputType = ["image/jpeg", "image/png", "image/webp"].includes(file.type) ? file.type : "image/jpeg";
  const quality = outputType === "image/png" ? undefined : JPEG_QUALITY;

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("이미지 압축에 실패했습니다."));
        return;
      }
      resolve(blob);
    }, outputType, quality);
  });
}

async function compressImageFile(file) {
  if (file.type === "image/gif") return file;
  if (file.size < MIN_COMPRESSION_CANDIDATE_BYTES) return file;

  const imageBitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(imageBitmap.width, imageBitmap.height));
    const nextWidth = Math.max(1, Math.round(imageBitmap.width * scale));
    const nextHeight = Math.max(1, Math.round(imageBitmap.height * scale));
    const resizedBlob = await createResizedImageBlob(file, imageBitmap, nextWidth, nextHeight);

    if (resizedBlob.size >= file.size) return file;

    return new File([resizedBlob], file.name, {
      type: resizedBlob.type || file.type,
      lastModified: file.lastModified
    });
  } finally {
    imageBitmap.close();
  }
}

export async function prepareImageFiles(files, onProgress) {
  const preparedFiles = [];

  for (let index = 0; index < files.length; index += 1) {
    const preparedFile = await compressImageFile(files[index]);
    preparedFiles.push(preparedFile);
    onProgress?.(index + 1, files.length);
  }

  return preparedFiles;
}

async function uploadFileWithRetry(target, file, retriesLeft, attempt = 1) {
  const startedAt = performance.now();
  try {
    await uploadToS3(target.putUrl, file);
    return {
      key: target.key,
      attempts: attempt,
      durationMs: performance.now() - startedAt
    };
  } catch (error) {
    if (retriesLeft <= 0) throw error;
    return uploadFileWithRetry(target, file, retriesLeft - 1, attempt + 1);
  }
}

export async function uploadFilesInBatches(uploadItems, onProgress) {
  const uploadedKeys = [];

  for (let index = 0; index < uploadItems.length; index += MAX_UPLOAD_CONCURRENCY) {
    const batch = uploadItems.slice(index, index + MAX_UPLOAD_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async ({ file, target }) => {
        const result = await uploadFileWithRetry(target, file, MAX_UPLOAD_RETRIES);
        onProgress?.({
          key: result.key,
          fileName: file?.name ?? "",
          fileSize: file?.size ?? 0,
          attempts: result.attempts,
          durationMs: result.durationMs
        });
        return result.key;
      })
    );
    uploadedKeys.push(...batchResults);
  }

  return uploadedKeys;
}
