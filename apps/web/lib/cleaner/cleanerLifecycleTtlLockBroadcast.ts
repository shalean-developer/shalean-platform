/** Cross-tab mirror for TTL complete lock (localStorage is cross-tab; BC is same-browser instant). */

const CHANNEL_NAME = "cleaner-lifecycle-ttl-lock-v1";

export type TtlCompleteLockBroadcastKind = "set" | "clear";

type TtlLockMessage = { type: "ttl-lock"; kind: TtlCompleteLockBroadcastKind };

export function broadcastTtlCompleteLockChanged(kind: TtlCompleteLockBroadcastKind): void {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const bc = new BroadcastChannel(CHANNEL_NAME);
    bc.postMessage({ type: "ttl-lock", kind } satisfies TtlLockMessage);
    bc.close();
  } catch {
    /* ignore */
  }
}

export function subscribeTtlCompleteLockBroadcast(cb: (kind: TtlCompleteLockBroadcastKind) => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  let bc: BroadcastChannel;
  try {
    bc = new BroadcastChannel(CHANNEL_NAME);
  } catch {
    return () => {};
  }
  bc.onmessage = (ev: MessageEvent<TtlLockMessage>) => {
    const kind = ev.data?.type === "ttl-lock" ? ev.data.kind : undefined;
    if (kind === "set" || kind === "clear") cb(kind);
  };
  return () => {
    bc.onmessage = null;
    bc.close();
  };
}
