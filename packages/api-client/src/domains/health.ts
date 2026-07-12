import type { ApiClient, ApiResult } from "../types";

export type HealthResponse = {
  status: string;
  service?: string;
  timestamp?: string;
};

/** Existing `GET /api/health` — no auth. */
export function createHealthApi(client: ApiClient) {
  return {
    get(): Promise<ApiResult<HealthResponse>> {
      return client.requestJson<HealthResponse>("/api/health", {
        method: "GET",
        skipAuth: true,
      });
    },
  };
}

export type HealthApi = ReturnType<typeof createHealthApi>;
