import type { ApiResult } from "@shalean/api-client";
import { getMobileApiClient } from "@/lib/api/createMobileApiClient";
import type { CleanerLoginResponse, CleanerMeResponse } from "@/services/types/cleanerJobs";

/**
 * Cleaner domain API — wraps `@shalean/api-client` paths only.
 * No UI logic.
 */
export const CleanerApi = {
  login(phone: string, password: string): Promise<ApiResult<CleanerLoginResponse>> {
    return getMobileApiClient().requestJson<CleanerLoginResponse>("/api/cleaner/login", {
      method: "POST",
      skipAuth: true,
      json: { phone, password },
    });
  },

  me(): Promise<ApiResult<CleanerMeResponse>> {
    return getMobileApiClient().requestJson<CleanerMeResponse>("/api/cleaner/me");
  },

  setAvailability(isAvailable: boolean): Promise<ApiResult<CleanerMeResponse>> {
    return getMobileApiClient().requestJson<CleanerMeResponse>("/api/cleaner/me", {
      method: "PATCH",
      json: { is_available: isAvailable },
    });
  },
};
