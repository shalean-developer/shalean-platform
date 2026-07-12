import type { ApiClient, ApiResult } from "../types";

/** Existing Paystack verify / status / payment-precheck — no secret key; webhook remains authority. */
export function createPaystackApi(client: ApiClient) {
  return {
    verify<T = unknown>(body: { reference: string }): Promise<ApiResult<T>> {
      return client.requestJson<T>("/api/paystack/verify", {
        method: "POST",
        json: body,
        skipAuth: true,
      });
    },

    status<T = unknown>(reference: string): Promise<ApiResult<T>> {
      const q = encodeURIComponent(reference);
      return client.requestJson<T>(`/api/paystack/status?reference=${q}`, {
        method: "GET",
        skipAuth: true,
      });
    },

    paymentPrecheck<T = unknown>(body: {
      bookingId: string;
      expectedTotalZar: number;
    }): Promise<ApiResult<T>> {
      return client.requestJson<T>("/api/bookings/payment-precheck", {
        method: "POST",
        json: body,
        skipAuth: true,
      });
    },
  };
}

export type PaystackApi = ReturnType<typeof createPaystackApi>;
