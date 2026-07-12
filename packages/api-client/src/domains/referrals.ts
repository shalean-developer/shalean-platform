import type { ApiClient, ApiResult } from "../types";

/** Existing `/api/referrals/*` and promotions validate — no credit math on client. */
export function createReferralsApi(client: ApiClient) {
  return {
    me<T = unknown>(): Promise<ApiResult<T>> {
      return client.requestJson<T>("/api/referrals/me", { method: "GET" });
    },

    credit<T = unknown>(): Promise<ApiResult<T>> {
      return client.requestJson<T>("/api/referrals/credit", { method: "GET" });
    },

    creditHistory<T = unknown>(): Promise<ApiResult<T>> {
      return client.requestJson<T>("/api/referrals/credit/history", { method: "GET" });
    },

    settings<T = unknown>(): Promise<ApiResult<T>> {
      return client.requestJson<T>("/api/referrals/settings", {
        method: "GET",
        skipAuth: true,
      });
    },

    validateCheckout<T = unknown>(body: unknown): Promise<ApiResult<T>> {
      return client.requestJson<T>("/api/referrals/validate-checkout", {
        method: "POST",
        json: body,
      });
    },

    submit<T = unknown>(body: unknown): Promise<ApiResult<T>> {
      return client.requestJson<T>("/api/referrals/submit", {
        method: "POST",
        json: body,
      });
    },
  };
}

export function createPromotionsApi(client: ApiClient) {
  return {
    validate<T = unknown>(body: unknown): Promise<ApiResult<T>> {
      return client.requestJson<T>("/api/promotions/validate", {
        method: "POST",
        json: body,
        skipAuth: true,
      });
    },
  };
}

export type ReferralsApi = ReturnType<typeof createReferralsApi>;
export type PromotionsApi = ReturnType<typeof createPromotionsApi>;
