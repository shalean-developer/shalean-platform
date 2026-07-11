import { createApiClient, type ApiClient } from "@shalean/api-client";
import { API_BASE_URL } from "@/constants/config";
import { secureStoreTokenProvider } from "@/lib/auth/secureStoreTokenProvider";

let cached: ApiClient | null = null;

/** Shared mobile HTTP client for Shalean `/api/*` routes. */
export function getMobileApiClient(): ApiClient {
  if (!cached) {
    cached = createApiClient({
      baseUrl: API_BASE_URL,
      tokenProvider: secureStoreTokenProvider,
      timeoutMs: 30_000,
      auth: { retryOnUnauthorized: true },
    });
  }
  return cached;
}

/** Drop the cached client (e.g. after sign-out so the next call rebuilds cleanly). */
export function resetMobileApiClient(): void {
  cached = null;
}
