import type { ApiClient, ApiResult } from "../types";

export function createCustomerNotificationsApi(client: ApiClient) {
  return {
    list<T = unknown>(query?: { limit?: number }): Promise<ApiResult<T>> {
      const qs =
        query?.limit != null ? `?limit=${encodeURIComponent(String(query.limit))}` : "";
      return client.requestJson<T>(`/api/customer/notifications${qs}`, { method: "GET" });
    },

    markRead<T = unknown>(body?: { id?: string; all?: boolean }): Promise<ApiResult<T>> {
      return client.requestJson<T>("/api/customer/notifications/mark-read", {
        method: "POST",
        json: body ?? {},
      });
    },
  };
}

export type CustomerNotificationsApi = ReturnType<typeof createCustomerNotificationsApi>;

export function createCustomerDevicesApi(client: ApiClient) {
  return {
    register<T = unknown>(body: { token: string; platform?: string }): Promise<ApiResult<T>> {
      return client.requestJson<T>("/api/customer/devices", {
        method: "POST",
        json: body,
      });
    },

    unregister<T = unknown>(body: { token: string }): Promise<ApiResult<T>> {
      return client.requestJson<T>("/api/customer/devices", {
        method: "DELETE",
        json: body,
      });
    },
  };
}

export type CustomerDevicesApi = ReturnType<typeof createCustomerDevicesApi>;
