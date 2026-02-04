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
  return request("/api/listings", {
    method: "POST",
    body: payload instanceof FormData ? payload : JSON.stringify(payload)
  });
}

export function fetchListingSummaries() {
  return request("/api/listings/summaries");
}

export function fetchListingDetail(listingId) {
  return request(`/api/listings/${listingId}`);
}

export function updateListingSoldStatus(listingId, completed) {
  return request(`/api/listings/${listingId}/sold`, {
    method: "PATCH",
    body: JSON.stringify({
      sold: completed
    })
  });
}

export function deleteListing(listingId) {
  return request(`/api/listings/${listingId}`, {
    method: "DELETE"
  });
}
