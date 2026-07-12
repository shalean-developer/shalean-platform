import type { ApiClient, ApiResult } from "../types";

/**
 * Customer recurring plans — existing `/api/me/recurring*` routes.
 * Response shapes are owned by apps/web; callers supply generics as needed.
 */
export function createCustomerRecurringApi(client: ApiClient) {
  return {
    list<T = unknown>(): Promise<ApiResult<T>> {
      return client.requestJson<T>("/api/me/recurring", { method: "GET" });
    },

    pause<T = unknown>(id: string): Promise<ApiResult<T>> {
      return client.requestJson<T>(`/api/me/recurring/${encodeURIComponent(id)}/pause`, {
        method: "POST",
        json: {},
      });
    },

    resume<T = unknown>(id: string): Promise<ApiResult<T>> {
      return client.requestJson<T>(`/api/me/recurring/${encodeURIComponent(id)}/resume`, {
        method: "POST",
        json: {},
      });
    },

    skip<T = unknown>(id: string): Promise<ApiResult<T>> {
      return client.requestJson<T>(`/api/me/recurring/${encodeURIComponent(id)}/skip`, {
        method: "POST",
        json: {},
      });
    },

    cancel<T = unknown>(id: string): Promise<ApiResult<T>> {
      return client.requestJson<T>(`/api/me/recurring/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
        json: {},
      });
    },
  };
}

export type CustomerRecurringApi = ReturnType<typeof createCustomerRecurringApi>;
