const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;
const buckets = new Map<string, number[]>();

/**
 * In-memory IP window for Meta data-deletion callback abuse protection.
 * Fail-open is intentionally avoided: over-limit returns false (caller must 429).
 * Note: per-instance only (sufficient as a foundation control on serverless).
 */
export function allowMetaDataDeletionRequest(key: string): boolean {
  const now = Date.now();
  const prev = buckets.get(key) ?? [];
  const pruned = prev.filter((t) => now - t < WINDOW_MS);
  if (pruned.length >= MAX_REQUESTS) {
    buckets.set(key, pruned);
    return false;
  }
  pruned.push(now);
  buckets.set(key, pruned);
  return true;
}

export function metaDataDeletionRateLimitKey(request: Request): string {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) {
    const first = xf.split(",")[0]?.trim();
    if (first) return `meta-ddr:${first}`;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return `meta-ddr:${realIp}`;
  return "meta-ddr:unknown";
}
