import { useMutation, useQueryClient } from "@tanstack/react-query";
import { actionLabel, newIdempotencyKey } from "@/lib/jobs/deriveCleanerJobActions";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import { fetchIsOnline } from "@/lib/network/networkStatus";
import { offlineActionQueue } from "@/lib/offline/actionQueue";
import { compressImageForUpload } from "@/lib/photos/compressImage";
import { uploadPhotoWithProgress, type UploadProgress } from "@/lib/photos/uploadPhotoWithProgress";
import { JobsApi } from "@/services/jobsApi";
import type { CleanerLifecycleAction } from "@/services/types/cleanerJobs";
import { cleanerQueryKeys } from "@/hooks/useCleanerProfile";
import { diagnosticLog } from "@/lib/diagnostics/logger";

export type LifecycleMutationResult =
  | { queued: false; data: unknown }
  | { queued: true; queueId: string };

export function useJobLifecycleMutation(bookingId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (action: CleanerLifecycleAction): Promise<LifecycleMutationResult> => {
      const key = newIdempotencyKey();
      const online = await fetchIsOnline();

      if (!online) {
        const item = await offlineActionQueue.enqueueLifecycle({
          bookingId,
          action,
          idempotencyKey: key,
        });
        return { queued: true, queueId: item.id };
      }

      const res = await JobsApi.lifecycle(bookingId, action, key);
      if (!res.ok) {
        // Network-ish failure → queue for retry with same idempotency key
        if (res.status === 0 || res.status >= 500 || res.status === 503) {
          const item = await offlineActionQueue.enqueueLifecycle({
            bookingId,
            action,
            idempotencyKey: key,
          });
          diagnosticLog.warn("Lifecycle queued after transport failure", {
            action,
            bookingId,
            status: res.status,
          });
          return { queued: true, queueId: item.id };
        }
        const code =
          res.body && typeof res.body === "object" && "code" in res.body
            ? String((res.body as { code?: string }).code ?? "")
            : "";
        throw new Error(res.error || `${actionLabel(action)} failed.${code ? ` (${code})` : ""}`);
      }
      return { queued: false, data: res.data };
    },
    onSuccess: async (result) => {
      if (result.queued) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: cleanerQueryKeys.jobsCard }),
        queryClient.invalidateQueries({ queryKey: cleanerQueryKeys.dashboard }),
        queryClient.invalidateQueries({ queryKey: cleanerQueryKeys.job(bookingId) }),
      ]);
    },
  });
}

export type PhotoUploadInput = {
  sectionKey: string;
  photoType: "before" | "after";
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
};

export function useJobPhotoUpload(bookingId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: PhotoUploadInput) => {
      const compressed = await compressImageForUpload({
        uri: params.uri,
        mimeType: params.mimeType,
        fileName: params.fileName,
      });

      const online = await fetchIsOnline();
      if (!online) {
        const item = await offlineActionQueue.enqueuePhoto({
          bookingId,
          sectionKey: params.sectionKey,
          photoType: params.photoType,
          uri: compressed.uri,
          mimeType: compressed.mimeType,
          fileName: compressed.fileName,
        });
        return { queued: true as const, queueId: item.id };
      }

      const res = await uploadPhotoWithProgress({
        bookingId,
        sectionKey: params.sectionKey,
        photoType: params.photoType,
        uri: compressed.uri,
        mimeType: compressed.mimeType,
        fileName: compressed.fileName,
        onProgress: params.onProgress,
        signal: params.signal,
      });

      if (!res.ok) {
        if (res.status === 0 && res.error === "Upload cancelled.") {
          throw new Error("Upload cancelled.");
        }
        if (res.status === 0 || res.status >= 500 || res.status === 503) {
          const item = await offlineActionQueue.enqueuePhoto({
            bookingId,
            sectionKey: params.sectionKey,
            photoType: params.photoType,
            uri: compressed.uri,
            mimeType: compressed.mimeType,
            fileName: compressed.fileName,
          });
          return { queued: true as const, queueId: item.id };
        }
        throw new Error(friendlyErrorMessage(res.error));
      }

      return { queued: false as const, data: res.data };
    },
    onSuccess: async (result) => {
      if (result.queued) return;
      await queryClient.invalidateQueries({ queryKey: cleanerQueryKeys.job(bookingId) });
    },
  });
}
