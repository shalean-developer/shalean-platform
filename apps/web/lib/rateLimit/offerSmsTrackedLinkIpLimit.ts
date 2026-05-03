const OFFER_TRACK_WINDOW_MS = 60_000;
const OFFER_TRACK_MAX = 30;
const MAGIC_SESSION_WINDOW_MS = 60_000;
const MAGIC_SESSION_MAX = 20;

const offerBuckets = new Map<string, number[]>();
const magicBuckets = new Map<string, number[]>();

function clientIpKey(request: Request, prefix: string): string {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) {
    const first = xf.split(",")[0]?.trim();
    if (first) return `${prefix}:${first}`;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return `${prefix}:${realIp}`;
  return `${prefix}:unknown`;
}

export function offerSmsTrackedLinkRateLimitKey(request: Request): string {
  return clientIpKey(request, "r-offer");
}

export function allowOfferSmsTrackedLinkRequest(request: Request): boolean {
  return allowWindowed(offerBuckets, offerSmsTrackedLinkRateLimitKey(request), OFFER_TRACK_WINDOW_MS, OFFER_TRACK_MAX);
}

export function cleanerMagicSessionRateLimitKey(request: Request): string {
  return clientIpKey(request, "magic-job");
}

export function allowCleanerMagicSessionRequest(request: Request): boolean {
  return allowWindowed(magicBuckets, cleanerMagicSessionRateLimitKey(request), MAGIC_SESSION_WINDOW_MS, MAGIC_SESSION_MAX);
}

function allowWindowed(buckets: Map<string, number[]>, key: string, windowMs: number, maxRequests: number): boolean {
  const now = Date.now();
  const prev = buckets.get(key) ?? [];
  const pruned = prev.filter((t) => now - t < windowMs);
  if (pruned.length >= maxRequests) {
    buckets.set(key, pruned);
    return false;
  }
  pruned.push(now);
  buckets.set(key, pruned);
  return true;
}
