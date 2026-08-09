import type { ApiResult } from "@shalean/api-client";
import { getMobileApiClient } from "@/lib/api/createMobileApiClient";
import type { CleanerPerformanceResponse } from "@/services/types/cleanerPerformance";
import type {
  CleanerEarningsResponse,
  CleanerFeedbackListResponse,
  CleanerLoginResponse,
  CleanerMeResponse,
  CleanerProfileSummaryResponse,
  CleanerReferralMeResponse,
  CleanerRosterResponse,
} from "@/services/types/cleanerJobs";

export const CleanerApi = {
  login(phone: string, password: string): Promise<ApiResult<CleanerLoginResponse>> {
    return getMobileApiClient().requestJson<CleanerLoginResponse>("/api/cleaner/login", { method: "POST", skipAuth: true, json: { phone, password } });
  },
  me(): Promise<ApiResult<CleanerMeResponse>> { return getMobileApiClient().requestJson<CleanerMeResponse>("/api/cleaner/me"); },
  setAvailability(isAvailable: boolean): Promise<ApiResult<CleanerMeResponse>> { return getMobileApiClient().requestJson<CleanerMeResponse>("/api/cleaner/me", { method: "PATCH", json: { is_available: isAvailable } }); },
  earnings(): Promise<ApiResult<CleanerEarningsResponse>> { return getMobileApiClient().requestJson<CleanerEarningsResponse>("/api/cleaner/earnings"); },
  performance(days = 90): Promise<ApiResult<CleanerPerformanceResponse>> { return getMobileApiClient().requestJson<CleanerPerformanceResponse>(`/api/cleaner/performance?days=${encodeURIComponent(String(days))}`); },
  roster(): Promise<ApiResult<CleanerRosterResponse>> { return getMobileApiClient().requestJson<CleanerRosterResponse>("/api/cleaner/roster"); },
  referralsMe(): Promise<ApiResult<CleanerReferralMeResponse>> { return getMobileApiClient().requestJson<CleanerReferralMeResponse>("/api/cleaner/referrals/me"); },
  profileSummary(): Promise<ApiResult<CleanerProfileSummaryResponse>> { return getMobileApiClient().requestJson<CleanerProfileSummaryResponse>("/api/cleaner/profile-summary"); },
  listFeedback(): Promise<ApiResult<CleanerFeedbackListResponse>> { return getMobileApiClient().requestJson<CleanerFeedbackListResponse>("/api/cleaner/report-feedback"); },
  submitFeedback(body: { submission_type: "report" | "feedback"; subject?: string | null; message: string }): Promise<ApiResult<{ ok?: boolean; id?: string }>> { return getMobileApiClient().requestJson("/api/cleaner/report-feedback", { method: "POST", json: body }); },
  registerPushDevice(body: { token: string; platform?: string }): Promise<ApiResult<{ ok?: boolean; app?: string }>> { return getMobileApiClient().requestJson("/api/cleaner/devices", { method: "POST", json: body }); },
  unregisterPushDevice(body: { token: string }): Promise<ApiResult<{ ok?: boolean }>> { return getMobileApiClient().requestJson("/api/cleaner/devices", { method: "DELETE", json: body }); },
};
