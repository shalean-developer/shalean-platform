import type { QueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import { diagnosticLog } from "@/lib/diagnostics/logger";
import { markSynced } from "@/lib/network/networkStatus";
import {
  QUEUE_MAX_ATTEMPTS,
  offlineActionQueue,
  queueBackoffMs,
  type OfflineQueueItem,
} from "@/lib/offline/actionQueue";
import { deletePersistedQueuedPhoto } from "@/lib/photos/persistQueuedPhoto";
import { cleanerQueryKeys } from "@/hooks/useCleanerProfile";
import { JobsApi } from "@/services/jobsApi";

let flushing = false;

function isReadyToAttempt(item: OfflineQueueItem, now: number): boolean {
  if (item.status === "dead" || item.status === "in_flight") return false;
  if (item.status !== "pending" && item.status !== "failed") return false;
  if (item.nextAttemptAt && item.nextAttemptAt > now) return false;
  return true;
}

async function processItem(item: OfflineQueueItem): Promise<void> {
  await offlineActionQueue.markInFlight(item.id);

  if (item.type === "lifecycle") {
    const res = await JobsApi.lifecycle(item.bookingId, item.action, item.idempotencyKey);
    if (!res.ok) {
      // 4xx (except transient) should not retry forever with same payload
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        const err = new Error(res.error || "Lifecycle action rejected.");
        (err as Error & { fatal?: boolean }).fatal = true;
        throw err;
      }
      throw new Error(res.error || "Lifecycle action failed.");
    }
    await offlineActionQueue.remove(item.id);
    diagnosticLog.info("Queued lifecycle flushed", {
      id: item.id,
      action: item.action,
      bookingId: item.bookingId,
      duplicate: res.data?.duplicate === true,
    });
    return;
  }

  const res = await JobsApi.uploadPhoto({
    bookingId: item.bookingId,
    sectionKey: item.sectionKey,
    photoType: item.photoType,
    uri: item.uri,
    mimeType: item.mimeType,
    fileName: item.fileName,
  });
  if (!res.ok) {
    if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
      const err = new Error(res.error || "Photo upload rejected.");
      (err as Error & { fatal?: boolean }).fatal = true;
      throw err;
    }
    throw new Error(res.error || "Photo upload failed.");
  }
  await offlineActionQueue.remove(item.id);
  await deletePersistedQueuedPhoto(item.uri);
  diagnosticLog.info("Queued photo flushed", { id: item.id, bookingId: item.bookingId });
}

/**
 * Flush pending offline actions in FIFO order.
 * Lifecycle items keep a stable idempotency key across retries (no duplicates).
 * Applies exponential backoff and a max-attempt ceiling.
 */
export async function flushOfflineActionQueue(queryClient?: QueryClient): Promise<{
  processed: number;
  failed: number;
  skipped: number;
}> {
  if (flushing) {
    return { processed: 0, failed: 0, skipped: 0 };
  }
  flushing = true;
  let processed = 0;
  let failed = 0;
  let skipped = 0;
  const now = Date.now();

  try {
    const items = (await offlineActionQueue.list()).filter((i) => isReadyToAttempt(i, now));
    skipped = (await offlineActionQueue.list()).filter(
      (i) => (i.status === "pending" || i.status === "failed") && !isReadyToAttempt(i, now),
    ).length;

    for (const item of items) {
      try {
        await processItem(item);
        processed += 1;
        if (queryClient) {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: cleanerQueryKeys.jobsCard }),
            queryClient.invalidateQueries({ queryKey: cleanerQueryKeys.job(item.bookingId) }),
            queryClient.invalidateQueries({ queryKey: cleanerQueryKeys.earnings }),
          ]);
        }
      } catch (e) {
        failed += 1;
        const msg = friendlyErrorMessage(e);
        const fatal = Boolean((e as Error & { fatal?: boolean })?.fatal);
        const nextAttempts = item.attempts + 1;
        if (fatal || nextAttempts >= QUEUE_MAX_ATTEMPTS) {
          await offlineActionQueue.markFailed(item.id, msg, { dead: true });
          diagnosticLog.error("Queue item dead-lettered", {
            id: item.id,
            attempts: nextAttempts,
            error: msg,
            fatal,
          });
        } else {
          const nextAttemptAt = Date.now() + queueBackoffMs(nextAttempts);
          await offlineActionQueue.markFailed(item.id, msg, { nextAttemptAt });
          diagnosticLog.warn("Queue item failed; will retry", {
            id: item.id,
            attempts: nextAttempts,
            nextAttemptAt,
            error: msg,
          });
        }
      }
    }

    if (processed > 0) {
      markSynced();
    }
  } finally {
    flushing = false;
  }

  return { processed, failed, skipped };
}
