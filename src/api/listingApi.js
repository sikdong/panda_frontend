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
    body: payload instanceof FormData ? payload : JSON.stringify(payload)
  });
}

export function fetchListingSummaries() {
  return request("/api/v1/listings/summaries");
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
    body: payload instanceof FormData ? payload : JSON.stringify(payload)
  });
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
