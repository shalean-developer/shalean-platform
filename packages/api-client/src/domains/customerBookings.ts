import type { ApiClient, ApiResult } from "../types";

/**
 * Customer booking management — existing `/api/customer/bookings*` routes.
 * Response shapes are owned by apps/web; callers supply generics as needed.
 */
export function createCustomerBookingsApi(client: ApiClient) {
  return {
    list<T = unknown>(): Promise<ApiResult<T>> {
      return client.requestJson<T>("/api/customer/bookings", { method: "GET" });
    },

    get<T = unknown>(id: string): Promise<ApiResult<T>> {
      return client.requestJson<T>(`/api/customer/bookings/${encodeURIComponent(id)}`, {
        method: "GET",
      });
    },

    cancel<T = unknown>(id: string, body?: unknown): Promise<ApiResult<T>> {
      return client.requestJson<T>(
        `/api/customer/bookings/${encodeURIComponent(id)}/cancel`,
        { method: "POST", json: body ?? {} },
      );
    },

    reschedule<T = unknown>(
      id: string,
      body: { date: string; time: string } & Record<string, unknown>,
    ): Promise<ApiResult<T>> {
      return client.requestJson<T>(
        `/api/customer/bookings/${encodeURIComponent(id)}/reschedule`,
        { method: "PATCH", json: body },
      );
    },

    /** Live tracking DTO — ownership enforced server-side; point only when trackable. */
    track<T = unknown>(id: string): Promise<ApiResult<T>> {
      return client.requestJson<T>(
        `/api/customer/bookings/${encodeURIComponent(id)}/track`,
        { method: "GET" },
      );
    },
  };
}

export type CustomerBookingsApi = ReturnType<typeof createCustomerBookingsApi>;
