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

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody.message ?? "Request failed.";
    const error = new Error(message);
    error.details = errorBody;
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
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
