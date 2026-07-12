import type { ApiClient, ApiResult } from "../types";

/**
 * Signed rebook deep-link prefill — `GET /api/rebook/prefill` (skipAuth).
 * Signed-in rebook uses {@link createCustomerBookingsApi}.get instead.
 */
export function createRebookApi(client: ApiClient) {
  return {
    prefill<T = unknown>(params: { rebook: string; rt: string }): Promise<ApiResult<T>> {
      const q = new URLSearchParams({
        rebook: params.rebook,
        rt: params.rt,
      });
      return client.requestJson<T>(`/api/rebook/prefill?${q.toString()}`, {
        method: "GET",
        skipAuth: true,
      });
    },
  };
}

export type RebookApi = ReturnType<typeof createRebookApi>;
