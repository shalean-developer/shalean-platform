import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CleanerLifecycleAction } from "@/services/types/cleanerJobs";
import { diagnosticLog } from "@/lib/diagnostics/logger";
import { persistQueuedPhotoUri } from "@/lib/photos/persistQueuedPhoto";

const QUEUE_KEY = "shalean.offline.action_queue.v1";
export const QUEUE_MAX_ATTEMPTS = 8;

export type QueueItemStatus = "pending" | "in_flight" | "failed" | "dead";

export type LifecycleQueueItem = {
  id: string;
  type: "lifecycle";
  bookingId: string;
  action: CleanerLifecycleAction;
  idempotencyKey: string;
  createdAt: number;
  status: QueueItemStatus;
  lastError?: string;
  attempts: number;
  nextAttemptAt?: number;
};

export type PhotoQueueItem = {
  id: string;
  type: "photo";
  bookingId: string;
  sectionKey: string;
  photoType: "before" | "after";
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  createdAt: number;
  status: QueueItemStatus;
  lastError?: string;
  attempts: number;
  nextAttemptAt?: number;
};

export type OfflineQueueItem = LifecycleQueueItem | PhotoQueueItem;

type Listener = (items: OfflineQueueItem[]) => void;

const listeners = new Set<Listener>();
let memoryCache: OfflineQueueItem[] | null = null;

function notify(items: OfflineQueueItem[]) {
  for (const l of listeners) l(items);
}

async function readAll(): Promise<OfflineQueueItem[]> {
  if (memoryCache) return memoryCache;
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    memoryCache = raw ? (JSON.parse(raw) as OfflineQueueItem[]) : [];
  } catch {
    memoryCache = [];
  }
  return memoryCache;
}

async function writeAll(items: OfflineQueueItem[]): Promise<void> {
  memoryCache = items;
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  notify(items);
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isActiveStatus(status: QueueItemStatus): boolean {
  return status === "pending" || status === "failed" || status === "in_flight";
}

export const offlineActionQueue = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    void readAll().then(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  async list(): Promise<OfflineQueueItem[]> {
    return readAll();
  },

  async pendingCount(): Promise<number> {
    const items = await readAll();
    return items.filter((i) => isActiveStatus(i.status)).length;
  },

  /**
   * Enqueue lifecycle action. Reuses an existing pending item for the same booking+action
   * (same idempotency key) to prevent duplicate submissions.
   */
  async enqueueLifecycle(params: {
    bookingId: string;
    action: CleanerLifecycleAction;
    idempotencyKey: string;
  }): Promise<LifecycleQueueItem> {
    const items = await readAll();
    const existing = items.find(
      (i): i is LifecycleQueueItem =>
        i.type === "lifecycle" &&
        i.bookingId === params.bookingId &&
        i.action === params.action &&
        isActiveStatus(i.status),
    );
    if (existing) {
      diagnosticLog.info("Lifecycle queue deduped", {
        bookingId: params.bookingId,
        action: params.action,
        id: existing.id,
      });
      return existing;
    }

    const item: LifecycleQueueItem = {
      id: newId("life"),
      type: "lifecycle",
      bookingId: params.bookingId,
      action: params.action,
      idempotencyKey: params.idempotencyKey,
      createdAt: Date.now(),
      status: "pending",
      attempts: 0,
    };
    await writeAll([...items, item]);
    diagnosticLog.info("Lifecycle queued", { id: item.id, action: item.action, bookingId: item.bookingId });
    return item;
  },

  async enqueuePhoto(params: {
    bookingId: string;
    sectionKey: string;
    photoType: "before" | "after";
    uri: string;
    mimeType?: string | null;
    fileName?: string | null;
  }): Promise<PhotoQueueItem> {
    const durableUri = await persistQueuedPhotoUri({
      uri: params.uri,
      bookingId: params.bookingId,
      sectionKey: params.sectionKey,
      photoType: params.photoType,
    });

    const items = await readAll();
    const existing = items.find(
      (i): i is PhotoQueueItem =>
        i.type === "photo" &&
        i.bookingId === params.bookingId &&
        i.sectionKey === params.sectionKey &&
        i.photoType === params.photoType &&
        (i.uri === durableUri || i.uri === params.uri) &&
        isActiveStatus(i.status),
    );
    if (existing) return existing;

    const item: PhotoQueueItem = {
      id: newId("photo"),
      type: "photo",
      bookingId: params.bookingId,
      sectionKey: params.sectionKey,
      photoType: params.photoType,
      uri: durableUri,
      mimeType: params.mimeType,
      fileName: params.fileName,
      createdAt: Date.now(),
      status: "pending",
      attempts: 0,
    };
    await writeAll([...items, item]);
    diagnosticLog.info("Photo upload queued", { id: item.id, bookingId: item.bookingId });
    return item;
  },

  async markInFlight(id: string): Promise<void> {
    const items = await readAll();
    await writeAll(
      items.map((i) =>
        i.id === id ? { ...i, status: "in_flight" as const, attempts: i.attempts + 1 } : i,
      ),
    );
  },

  async markFailed(id: string, error: string, opts?: { dead?: boolean; nextAttemptAt?: number }): Promise<void> {
    const items = await readAll();
    await writeAll(
      items.map((i) =>
        i.id === id
          ? {
              ...i,
              status: opts?.dead ? ("dead" as const) : ("failed" as const),
              lastError: error,
              nextAttemptAt: opts?.dead ? undefined : opts?.nextAttemptAt,
            }
          : i,
      ),
    );
  },

  async remove(id: string): Promise<void> {
    const items = await readAll();
    await writeAll(items.filter((i) => i.id !== id));
  },

  async clear(): Promise<void> {
    await writeAll([]);
  },

  /**
   * Reset stranded `in_flight` items after an interrupted flush (app kill / crash).
   * Without this, queued actions can stall forever.
   */
  async recoverInterrupted(): Promise<number> {
    const items = await readAll();
    let recovered = 0;
    const next = items.map((i) => {
      if (i.status !== "in_flight") return i;
      recovered += 1;
      return {
        ...i,
        status: "pending" as const,
        nextAttemptAt: undefined,
        lastError: i.lastError ?? "Recovered after interrupted sync",
      };
    });
    if (recovered > 0) {
      await writeAll(next);
      diagnosticLog.warn("Recovered interrupted queue items", { count: recovered });
    }
    return recovered;
  },
};

/** Exponential backoff delay (ms) after N attempts (1-based). Cap at 15 minutes. */
export function queueBackoffMs(attempts: number): number {
  const base = Math.min(Math.max(attempts, 1), 10);
  return Math.min(1_000 * 2 ** (base - 1), 15 * 60_000);
}
