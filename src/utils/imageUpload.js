import { uploadToS3 } from "../api/listingApi";

const MAX_UPLOAD_CONCURRENCY = 4;
const MAX_UPLOAD_RETRIES = 2;
const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1920;
const JPEG_QUALITY = 0.82;
const MIN_COMPRESSION_CANDIDATE_BYTES = 300 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/jpg"]);
const WATERMARK_IMAGE_SOURCE = "/panda-watermark.png";
const WATERMARK_OPACITY = 0.22;
let watermarkImagePromise;

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

function loadWatermarkImage() {
  if (!watermarkImagePromise) {
    watermarkImagePromise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("워터마크 이미지를 불러오지 못했습니다."));
      image.src = WATERMARK_IMAGE_SOURCE;
    });
  }
  return watermarkImagePromise;
}

function createTransparentWatermarkCanvas(watermarkImage) {
  const watermarkCanvas = document.createElement("canvas");
  watermarkCanvas.width = watermarkImage.naturalWidth;
  watermarkCanvas.height = watermarkImage.naturalHeight;
  const watermarkContext = watermarkCanvas.getContext("2d");
  if (!watermarkContext) {
    throw new Error("워터마크 이미지를 초기화하지 못했습니다.");
  }

  watermarkContext.drawImage(watermarkImage, 0, 0);
  const imageData = watermarkContext.getImageData(0, 0, watermarkCanvas.width, watermarkCanvas.height);
  for (let index = 0; index < imageData.data.length; index += 4) {
    const darkness = 255 - Math.max(imageData.data[index], imageData.data[index + 1], imageData.data[index + 2]);
    imageData.data[index] = 0;
    imageData.data[index + 1] = 0;
    imageData.data[index + 2] = 0;
    imageData.data[index + 3] = Math.round((imageData.data[index + 3] * darkness) / 255);
  }
  watermarkContext.putImageData(imageData, 0, 0);
  return watermarkCanvas;
}

function drawCenteredWatermark(context, width, height, watermarkImage) {
  const watermarkCanvas = createTransparentWatermarkCanvas(watermarkImage);
  const aspectRatio = watermarkCanvas.width / watermarkCanvas.height;
  const watermarkWidth = Math.min(width * 0.36, height * 0.3 * aspectRatio);
  const watermarkHeight = watermarkWidth / aspectRatio;
  const x = (width - watermarkWidth) / 2;
  const y = (height - watermarkHeight) / 2;

  context.save();
  context.globalAlpha = WATERMARK_OPACITY;
  context.drawImage(watermarkCanvas, x, y, watermarkWidth, watermarkHeight);
  context.restore();
}

async function createWatermarkedImageBlob(file, imageBitmap) {
  const canvas = document.createElement("canvas");
  canvas.width = imageBitmap.width;
  canvas.height = imageBitmap.height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("이미지 워터마크를 초기화하지 못했습니다.");
  }

  context.drawImage(imageBitmap, 0, 0);
  drawCenteredWatermark(context, canvas.width, canvas.height, await loadWatermarkImage());

  const outputType = ["image/jpeg", "image/png", "image/webp"].includes(file.type) ? file.type : "image/jpeg";
  const quality = outputType === "image/png" ? undefined : JPEG_QUALITY;
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("이미지 워터마크 생성에 실패했습니다."));
        return;
      }
      resolve(blob);
    }, outputType, quality);
  });
}

function getWatermarkedFileName(fileName, outputType) {
  if (outputType !== "image/jpeg") return fileName;
  return fileName.replace(/(?:\.[^.]+)?$/, ".jpg");
}

async function addWatermarkToImageFile(file) {
  const imageBitmap = await createImageBitmap(file);
  try {
    const watermarkedBlob = await createWatermarkedImageBlob(file, imageBitmap);
    return new File([watermarkedBlob], getWatermarkedFileName(file.name, watermarkedBlob.type), {
      type: watermarkedBlob.type,
      lastModified: file.lastModified
    });
  } finally {
    imageBitmap.close();
  }
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
    const watermarkedFile = await addWatermarkToImageFile(files[index]);
    const preparedFile = await compressImageFile(watermarkedFile);
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
