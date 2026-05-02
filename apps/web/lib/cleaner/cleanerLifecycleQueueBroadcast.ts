/** Same-origin cross-tab signal (instant); complements `storage` which skips the writer tab. */

const CHANNEL_NAME = "cleaner-lifecycle-queue-v1";

let lifecycleBroadcastClientId: string | null = null;

/** Stable per-tab id — ignore BC messages from this tab (self-echo) without relying on version equality. */
export function getLifecycleBroadcastClientId(): string {
  if (lifecycleBroadcastClientId) return lifecycleBroadcastClientId;
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto && typeof crypto.randomUUID === "function") {
      lifecycleBroadcastClientId = crypto.randomUUID();
      return lifecycleBroadcastClientId;
    }
  } catch {
    /* fall through */
  }
  lifecycleBroadcastClientId = `c${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  return lifecycleBroadcastClientId;
}

/** Call after bfcache restore so this tab does not reuse a stale id from a duplicated/restored session. */
export function resetLifecycleBroadcastClientId(): void {
  lifecycleBroadcastClientId = null;
}

export type CleanerLifecycleQueueBroadcastPayload = {
  type: "queue-changed";
  /** CAS envelope version after write — receivers skip stale/out-of-order events. */
  version: number;
  /** Same-tab echo suppression (see {@link getLifecycleBroadcastClientId}). */
  clientId: string;
};

export function notifyCleanerLifecycleQueueChanged(version?: number): void {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const bc = new BroadcastChannel(CHANNEL_NAME);
    const v = typeof version === "number" && Number.isFinite(version) ? Math.max(0, Math.floor(version)) : 0;
    const clientId = getLifecycleBroadcastClientId();
    bc.postMessage({ type: "queue-changed", version: v, clientId } satisfies CleanerLifecycleQueueBroadcastPayload);
    bc.close();
  } catch {
    /* ignore */
  }
}

export function subscribeCleanerLifecycleQueueChanged(
  cb: (info: { version: number; clientId: string }) => void,
): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  let bc: BroadcastChannel;
  try {
    bc = new BroadcastChannel(CHANNEL_NAME);
  } catch {
    return () => {};
  }
  bc.onmessage = (ev: MessageEvent<CleanerLifecycleQueueBroadcastPayload>) => {
    const v =
      ev.data && typeof ev.data.version === "number" && Number.isFinite(ev.data.version)
        ? Math.max(0, Math.floor(ev.data.version))
        : 0;
    const clientId =
      ev.data && typeof ev.data.clientId === "string" && ev.data.clientId.trim() ? ev.data.clientId.trim() : "";
    cb({ version: v, clientId });
  };
  return () => {
    bc.onmessage = null;
    bc.close();
  };
}
