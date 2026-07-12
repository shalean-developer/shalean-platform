import type { ApiClient, ApiResult } from "../types";

/** Existing customer dashboard + recurring + rewards helpers. */
export function createCustomerDashboardApi(client: ApiClient) {
  return {
    summary<T = unknown>(): Promise<ApiResult<T>> {
      return client.requestJson<T>("/api/dashboard/summary", { method: "GET" });
    },

    markNotificationsRead<T = unknown>(body?: { id?: string }): Promise<ApiResult<T>> {
      return client.requestJson<T>("/api/dashboard/notifications/mark-read", {
        method: "POST",
        json: body ?? {},
      });
    },

    rewards<T = unknown>(): Promise<ApiResult<T>> {
      return client.requestJson<T>("/api/account/rewards", { method: "GET" });
    },

    reviews<T = unknown>(): Promise<ApiResult<T>> {
      return client.requestJson<T>("/api/me/reviews", { method: "GET" });
    },

    recurring<T = unknown>(): Promise<ApiResult<T>> {
      return client.requestJson<T>("/api/me/recurring", { method: "GET" });
    },
  };
}

export type CustomerDashboardApi = ReturnType<typeof createCustomerDashboardApi>;
