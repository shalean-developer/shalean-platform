import { API_BASE_URL } from "@/constants/config";
import { getAccessToken, refreshAccessToken } from "@/lib/auth/secureStoreTokenProvider";
import type { ApiResult } from "@shalean/api-client";
import type { PhotoUploadResponse } from "@/services/types/cleanerJobs";

export type UploadProgress = {
  loaded: number;
  total: number;
  /** 0–100 */
  percent: number;
};

export type UploadPhotoWithProgressParams = {
  bookingId: string;
  sectionKey: string;
  photoType: "before" | "after";
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
};

/**
 * Multipart photo upload with XHR progress + abort.
 * Hits the same `/api/cleaner/jobs/:id/qa/photos` contract as JobsApi.uploadPhoto.
 */
export async function uploadPhotoWithProgress(
  params: UploadPhotoWithProgressParams,
): Promise<ApiResult<PhotoUploadResponse>> {
  const mime = (params.mimeType || "image/jpeg").split(";")[0]!.trim() || "image/jpeg";
  const name =
    params.fileName?.trim() ||
    `photo.${mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg"}`;

  let token = (await getAccessToken())?.trim() || null;
  if (!token) {
    token = (await refreshAccessToken())?.trim() || null;
  }
  if (!token) {
    return { ok: false, status: 401, error: "Not signed in." };
  }

  const url = `${API_BASE_URL.replace(/\/$/, "")}/api/cleaner/jobs/${encodeURIComponent(params.bookingId)}/qa/photos`;

  const form = new FormData();
  form.append("section_key", params.sectionKey);
  form.append("photo_type", params.photoType);
  form.append("file", {
    uri: params.uri,
    name,
    type: mime,
  } as unknown as Blob);

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.timeout = 60_000;

    const onAbort = () => {
      xhr.abort();
    };
    params.signal?.addEventListener("abort", onAbort);

    xhr.upload.onprogress = (event) => {
      if (!params.onProgress) return;
      const total = event.lengthComputable ? event.total : 0;
      const loaded = event.loaded;
      const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
      params.onProgress({ loaded, total, percent });
    };

    xhr.onload = () => {
      params.signal?.removeEventListener("abort", onAbort);
      let body: PhotoUploadResponse & { error?: string } = { ok: true, id: "", created_at: "", signed_url: null };
      try {
        body = JSON.parse(xhr.responseText) as typeof body;
      } catch {
        /* empty */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ ok: true, data: body, status: xhr.status, headers: new Headers() });
        return;
      }
      resolve({
        ok: false,
        status: xhr.status,
        error: body.error ?? "Photo upload failed.",
        body,
      });
    };

    xhr.onerror = () => {
      params.signal?.removeEventListener("abort", onAbort);
      resolve({ ok: false, status: 503, error: "Could not reach the server." });
    };

    xhr.ontimeout = () => {
      params.signal?.removeEventListener("abort", onAbort);
      resolve({ ok: false, status: 503, error: "Upload timed out." });
    };

    xhr.onabort = () => {
      params.signal?.removeEventListener("abort", onAbort);
      resolve({ ok: false, status: 0, error: "Upload cancelled." });
    };

    xhr.send(form);
  });
}
