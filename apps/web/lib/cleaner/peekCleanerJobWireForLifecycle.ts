import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { signalLifecycleFlushBackoffClear } from "@/lib/cleaner/cleanerLifecycleFlushBackoffSignal";
import type { LifecycleWireLike } from "@/lib/cleaner/cleanerJobLifecyclePhaseRank";
import { wireLikeFromJobDetailCacheBody } from "@/lib/cleaner/cleanerQueuedLifecycleFlushGuard";

/** Lightweight GET for flush-time validation (status + response fields only). */
export async function peekCleanerJobWireForLifecycle(params: {
  bookingId: string;
  getHeaders: () => Promise<Record<string, string> | null>;
  /** Dedupe GETs for the same booking within one flush / short TTL (ms). */
  sessionCache?: Map<string, { wire: LifecycleWireLike; atMs: number }>;
  cacheTtlMs?: number;
  /** Incremented once per real network GET (not a cache hit). */
  peekCallsCount?: { n: number };
}): Promise<LifecycleWireLike | null> {
  const { bookingId, getHeaders, sessionCache, peekCallsCount } = params;
  const ttlMs = typeof params.cacheTtlMs === "number" && Number.isFinite(params.cacheTtlMs) ? Math.max(0, params.cacheTtlMs) : 8000;
  /** Soft TTL from caller, capped so a missed invalidation cannot serve wire past ~15s. */
  const effectivePeekTtlMs = Math.min(ttlMs, 15_000);
  const id = bookingId.trim();
  if (!id) return null;
  if (sessionCache) {
    const hit = sessionCache.get(id);
    if (hit) {
      const age = Date.now() - hit.atMs;
      if (age >= effectivePeekTtlMs) sessionCache.delete(id);
      else return hit.wire;
    }
  }
  const headers = await getHeaders();
  if (!headers) return null;
  if (peekCallsCount) peekCallsCount.n += 1;
  const res = await cleanerAuthenticatedFetch(`/api/cleaner/jobs/${encodeURIComponent(id)}`, { headers });
  if (!res.ok) return null;
  signalLifecycleFlushBackoffClear("lifecycle-peek");
  const j = (await res.json().catch(() => ({}))) as { job?: Record<string, unknown> };
  const body = j.job;
  if (!body || typeof body !== "object") return null;
  const wire = wireLikeFromJobDetailCacheBody(body);
  if (sessionCache && wire) sessionCache.set(id, { wire, atMs: Date.now() });
  return wire;
}
