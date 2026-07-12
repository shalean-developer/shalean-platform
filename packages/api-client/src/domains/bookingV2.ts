import type { ApiClient, ApiResult } from "../types";

/**
 * Booking-v2 funnel — existing `/api/booking-v2/*` routes.
 * No pricing logic; server owns quotes and confirm integrity.
 */
export function createBookingV2Api(client: ApiClient) {
  return {
    services<T = unknown>(): Promise<ApiResult<T>> {
      return client.requestJson<T>("/api/booking-v2/services", {
        method: "GET",
        skipAuth: true,
      });
    },

    resolveLocation<T = unknown>(query: Record<string, string>): Promise<ApiResult<T>> {
      const qs = new URLSearchParams(query).toString();
      return client.requestJson<T>(`/api/booking-v2/resolve-location?${qs}`, {
        method: "GET",
        skipAuth: true,
      });
    },

    availableCleaners<T = unknown>(query: Record<string, string>): Promise<ApiResult<T>> {
      const qs = new URLSearchParams(query).toString();
      return client.requestJson<T>(`/api/booking-v2/available-cleaners?${qs}`, {
        method: "GET",
        skipAuth: true,
      });
    },

    cleanerPublicProfile<T = unknown>(cleanerId: string): Promise<ApiResult<T>> {
      return client.requestJson<T>(
        `/api/booking-v2/cleaners/${encodeURIComponent(cleanerId)}/public-profile`,
        {
          method: "GET",
          skipAuth: true,
        },
      );
    },

    teamAvailability<T = unknown>(query: Record<string, string>): Promise<ApiResult<T>> {
      const qs = new URLSearchParams(query).toString();
      return client.requestJson<T>(`/api/booking-v2/team-availability?${qs}`, {
        method: "GET",
        skipAuth: true,
      });
    },

    equipmentQuote<T = unknown>(body: unknown): Promise<ApiResult<T>> {
      return client.requestJson<T>("/api/booking-v2/equipment-quote", {
        method: "POST",
        json: body,
        skipAuth: true,
      });
    },

    confirm<T = unknown>(body: unknown): Promise<ApiResult<T>> {
      return client.requestJson<T>("/api/booking-v2/confirm", {
        method: "POST",
        json: body,
      });
    },
  };
}

export type BookingV2Api = ReturnType<typeof createBookingV2Api>;
