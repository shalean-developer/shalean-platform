/** Cross-tab / cross-route hint to clear lifecycle flush HTTP backoff after a scoped healthy GET. */

const SESSION_KEY_V2 = "cleanerLifecycleFlushBackoffClearV2";
/** Legacy numeric timestamp only — ignored for backoff clear (unknown provenance). */
const SESSION_KEY_V1 = "cleanerLifecycleFlushBackoffClearMsV1";

export type LifecycleFlushBackoffClearSource = "lifecycle-peek" | "job-detail-get";

export type LifecycleFlushBackoffClearSignal = {
  t: number;
  src: LifecycleFlushBackoffClearSource;
};

export function signalLifecycleFlushBackoffClear(source: LifecycleFlushBackoffClearSource): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const payload: LifecycleFlushBackoffClearSignal = { t: Date.now(), src: source };
    sessionStorage.setItem(SESSION_KEY_V2, JSON.stringify(payload));
    sessionStorage.removeItem(SESSION_KEY_V1);
  } catch {
    /* ignore */
  }
}

/** Drop unreadable / ancient session values (not applied — see {@link LIFECYCLE_FLUSH_BACKOFF_CLEAR_APPLY_MAX_AGE_MS}). */
export const LIFECYCLE_FLUSH_BACKOFF_CLEAR_READ_MAX_AGE_MS = 120_000;

/** Only apply a clear hint if the signal is this fresh — avoids resurrecting stale clears after long idle. */
export const LIFECYCLE_FLUSH_BACKOFF_CLEAR_APPLY_MAX_AGE_MS = 10_000;

/** Latest backoff-clear signal, or null if missing / invalid / legacy-only / very old. */
export function readLifecycleFlushBackoffClearSignal(): LifecycleFlushBackoffClearSignal | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY_V2);
    if (!raw) return null;
    const o = JSON.parse(raw) as { t?: unknown; src?: unknown };
    const t = typeof o.t === "number" && Number.isFinite(o.t) ? o.t : 0;
    const src = o.src === "lifecycle-peek" || o.src === "job-detail-get" ? o.src : null;
    if (t > 0 && src) {
      if (Date.now() - t > LIFECYCLE_FLUSH_BACKOFF_CLEAR_READ_MAX_AGE_MS) return null;
      return { t, src };
    }
    return null;
  } catch {
    return null;
  }
}
