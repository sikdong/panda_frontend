const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:9111";

async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: isFormData
      ? { ...(options.headers ?? {}) }
      : {
          "Content-Type": "application/json",
          ...(options.headers ?? {})
        },
    ...options
  });

  const rawBody = await response.text();
  let parsedBody = null;
  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      parsedBody = null;
    }
  }

  if (!response.ok) {
    const errorBody = parsedBody ?? {};
    const message = errorBody.message ?? "Request failed.";
    const error = new Error(message);
    error.details = errorBody;
    throw error;
  }

  if (response.status === 204 || !rawBody) {
    return null;
  }

  return parsedBody;
}

export function createListing(payload) {
  return request("/api/v1/listings", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function fetchListingSummaries() {
  return request("/api/v1/listings/summaries");
}

export function fetchAdminListings() {
  return request("/api/v1/listings/admin");
}

export function fetchUnsoldListings() {
  return request("/api/v1/listings/unsold");
}

export function fetchListingDetail(listingId) {
  return request(`/api/v1/listings/${listingId}`);
}

export function fetchListingEditDetail(listingId) {
  return request(`/api/v1/listings/${listingId}/edit`);
}

export function updateListingSoldStatus(listingId, completed) {
  return request(`/api/v1/listings/${listingId}/sold`, {
    method: "PATCH",
    body: JSON.stringify({
      sold: completed
    })
  });
}

export function deleteListing(listingId) {
  return request(`/api/v1/listings/${listingId}`, {
    method: "DELETE"
  });
}

export function updateListing(listingId, payload) {
  return request(`/api/v1/listings/${listingId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function requestUploadUrls(listingId, files) {
  return request("/api/v1/images/presigned-urls", {
    method: "POST",
    body: JSON.stringify({
      listingId,
      files: files.map((file) => ({
        fileName: file.fileName,
        originalFileName: file.fileName,
        contentType: file.contentType,
        fileType: file.contentType,
        size: file.size,
        contentLength: file.size
      }))
    })
  });
}

export async function uploadToS3(putUrl, file, { timeoutMs = 30000 } = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(putUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream"
      },
      body: file,
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "S3 업로드에 실패했습니다.");
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("이미지 업로드 시간이 초과되었습니다.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function fetchBuildingLedger(params) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/v1/listings/building-ledger?${query}`);
}

export function fetchBuildingTitles(params) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/v1/listings/building-ledger/titles?${query}`);
}

export function fetchBuildingExclusivity(params) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/v1/listings/building-ledger/exclusivity?${query}`);
}
