import "server-only";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 5;

const buckets = new Map<string, number[]>();

function pruneKey(key: string, now: number): number[] {
  const arr = buckets.get(key) ?? [];
  const next = arr.filter((t) => now - t < WINDOW_MS);
  if (next.length === 0) buckets.delete(key);
  else buckets.set(key, next);
  return next;
}

/** Sliding window: max {@link MAX_REQUESTS} admin billing PATCH attempts per minute per admin+customer (replay + noop exempt at call site). */
export function checkAdminBillingSwitchRateLimit(
  adminUserId: string,
  customerId: string,
): { ok: true } | { ok: false; error: string; retryAfterSec: number } {
  const key = `${adminUserId}:${customerId}`;
  const now = Date.now();
  const window = pruneKey(key, now);
  if (window.length >= MAX_REQUESTS) {
    const oldest = window[0]!;
    const retryAfterSec = Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000));
    return {
      ok: false,
      error: "Too many billing updates for this customer. Try again in a moment.",
      retryAfterSec,
    };
  }
  window.push(now);
  buckets.set(key, window);
  if (buckets.size > 20_000) {
    for (const k of buckets.keys()) {
      pruneKey(k, now);
      if (buckets.size < 15_000) break;
    }
  }
  return { ok: true };
}
