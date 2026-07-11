import * as FileSystem from "expo-file-system";
import { diagnosticLog } from "@/lib/diagnostics/logger";

const QUEUE_DIR = `${FileSystem.documentDirectory ?? ""}shalean-queue-photos/`;

async function ensureQueueDir(): Promise<string | null> {
  if (!FileSystem.documentDirectory) return null;
  const info = await FileSystem.getInfoAsync(QUEUE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(QUEUE_DIR, { intermediates: true });
  }
  return QUEUE_DIR;
}

/**
 * Copy a temp/camera/manipulator URI into durable app document storage
 * so offline photo queue items survive app restarts.
 */
export async function persistQueuedPhotoUri(params: {
  uri: string;
  bookingId: string;
  sectionKey: string;
  photoType: string;
}): Promise<string> {
  try {
    const dir = await ensureQueueDir();
    if (!dir) return params.uri;

    const safeSection = params.sectionKey.replace(/[^a-z0-9_-]/gi, "_");
    const dest = `${dir}${params.bookingId}_${safeSection}_${params.photoType}_${Date.now()}.jpg`;
    await FileSystem.copyAsync({ from: params.uri, to: dest });
    diagnosticLog.info("Queued photo persisted to disk", { dest });
    return dest;
  } catch (e) {
    diagnosticLog.warn("Could not persist queued photo; using original URI", {
      error: e instanceof Error ? e.message : String(e),
    });
    return params.uri;
  }
}

export async function deletePersistedQueuedPhoto(uri: string): Promise<void> {
  try {
    if (!uri.includes("shalean-queue-photos")) return;
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  } catch {
    // best-effort cleanup
  }
}
