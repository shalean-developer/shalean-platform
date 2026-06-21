const WINDOW_MS = 60_000;
const MAX_REQUESTS = 8;
const buckets = new Map<string, number[]>();

export function allowPasswordResetRequest(key: string): boolean {
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

export function passwordResetRateLimitKey(request: Request): string {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) {
    const first = xf.split(",")[0]?.trim();
    if (first) return `pwd-reset:${first}`;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return `pwd-reset:${realIp}`;
  return "pwd-reset:unknown";
}
