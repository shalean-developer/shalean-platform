import type { ApiClient, ApiResult } from "../types";

/** Existing `/api/bookings/review` — server enforces ownership + eligibility. */
export function createCustomerReviewsApi(client: ApiClient) {
  return {
    submit<T = unknown>(body: {
      bookingId: string;
      rating: number;
      comment?: string;
    }): Promise<ApiResult<T>> {
      return client.requestJson<T>("/api/bookings/review", {
        method: "POST",
        json: body,
      });
    },

    update<T = unknown>(body: {
      bookingId: string;
      rating?: number;
      comment?: string;
    }): Promise<ApiResult<T>> {
      return client.requestJson<T>("/api/bookings/review", {
        method: "PATCH",
        json: body,
      });
    },
  };
}

export type CustomerReviewsApi = ReturnType<typeof createCustomerReviewsApi>;
