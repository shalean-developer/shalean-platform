import { createApiClient, type ApiClient } from "@shalean/api-client";
import { webTokenProvider } from "@/lib/api/webTokenProvider";

let cached: ApiClient | null = null;

/**
 * Shared browser HTTP client for same-origin `/api/*` calls.
 *
 * Behaviour constraints (must match pre-migration helpers):
 * - No default timeout (`timeoutMs: 0`) — `dashboardFetchJson` never timed out.
 * - No 401 auto-refresh retry — callers / cleanerAuthenticatedFetch own that.
 * - Relative paths (no baseUrl).
 */
export function getWebApiClient(): ApiClient {
  if (!cached) {
    cached = createApiClient({
      tokenProvider: webTokenProvider,
      timeoutMs: 0,
      auth: { retryOnUnauthorized: false },
    });
  }
  return cached;
}
