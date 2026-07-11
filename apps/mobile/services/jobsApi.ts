import type { ApiResult } from "@shalean/api-client";
import { getMobileApiClient } from "@/lib/api/createMobileApiClient";
import type {
  CleanerDashboardResponse,
  CleanerJobDetailResponse,
  CleanerJobsListResponse,
  CleanerLifecycleAction,
  PhotoUploadResponse,
} from "@/services/types/cleanerJobs";

export type UploadJobPhotoParams = {
  bookingId: string;
  sectionKey: string;
  photoType: "before" | "after";
  /** Local file URI from ImagePicker. */
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
};

/**
 * Cleaner jobs domain API — wraps `@shalean/api-client` paths only.
 * No UI logic.
 */
export const JobsApi = {
  listTodayCard(): Promise<ApiResult<CleanerJobsListResponse>> {
    return getMobileApiClient().requestJson<CleanerJobsListResponse>("/api/cleaner/jobs?view=card");
  },

  dashboard(): Promise<ApiResult<CleanerDashboardResponse>> {
    return getMobileApiClient().requestJson<CleanerDashboardResponse>("/api/cleaner/dashboard");
  },

  get(bookingId: string): Promise<ApiResult<CleanerJobDetailResponse>> {
    return getMobileApiClient().requestJson<CleanerJobDetailResponse>(
      `/api/cleaner/jobs/${encodeURIComponent(bookingId)}`,
    );
  },

  lifecycle(
    bookingId: string,
    action: CleanerLifecycleAction,
    idempotencyKey: string,
  ): Promise<ApiResult<{ ok?: boolean; duplicate?: boolean; error?: string; code?: string }>> {
    return getMobileApiClient().requestJson(`/api/cleaner/jobs/${encodeURIComponent(bookingId)}`, {
      method: "POST",
      json: { action, idempotency_key: idempotencyKey },
    });
  },

  async uploadPhoto(params: UploadJobPhotoParams): Promise<ApiResult<PhotoUploadResponse>> {
    const form = new FormData();
    form.append("section_key", params.sectionKey);
    form.append("photo_type", params.photoType);

    const mime = (params.mimeType || "image/jpeg").split(";")[0]!.trim() || "image/jpeg";
    const name =
      params.fileName?.trim() ||
      `photo.${mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg"}`;

    // React Native FormData file shape
    form.append("file", {
      uri: params.uri,
      name,
      type: mime,
    } as unknown as Blob);

    const client = getMobileApiClient();
    try {
      const res = await client.request(
        `/api/cleaner/jobs/${encodeURIComponent(params.bookingId)}/qa/photos`,
        {
          method: "POST",
          body: form,
          timeoutMs: 60_000,
        },
      );
      const body = (await res.json().catch(() => ({}))) as PhotoUploadResponse & {
        error?: string;
      };
      if (!res.ok) {
        return { ok: false, status: res.status, error: body.error ?? "Photo upload failed.", body };
      }
      return { ok: true, data: body, status: res.status, headers: res.headers };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Photo upload failed.";
      return { ok: false, status: 503, error: message };
    }
  },
};
