const IP_WINDOW_MS = 15 * 60_000;
const IP_MAX_REQUESTS = 5;
const PHONE_WINDOW_MS = 60 * 60_000;
const PHONE_MAX_REQUESTS = 10;

const ipBuckets = new Map<string, number[]>();
const phoneBuckets = new Map<string, number[]>();

function allowInWindow(
  buckets: Map<string, number[]>,
  key: string,
  windowMs: number,
  maxRequests: number,
): boolean {
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

export function allowCleanerLoginIpRequest(key: string): boolean {
  return allowInWindow(ipBuckets, key, IP_WINDOW_MS, IP_MAX_REQUESTS);
}

export function allowCleanerLoginPhoneRequest(key: string): boolean {
  return allowInWindow(phoneBuckets, key, PHONE_WINDOW_MS, PHONE_MAX_REQUESTS);
}

export function cleanerLoginIpRateLimitKey(request: Request): string {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) {
    const first = xf.split(",")[0]?.trim();
    if (first) return `cleaner-login-ip:${first}`;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return `cleaner-login-ip:${realIp}`;
  return "cleaner-login-ip:unknown";
}

export function cleanerLoginPhoneRateLimitKey(phone: string): string {
  const normalized = phone.replace(/\D/g, "");
  return normalized ? `cleaner-login-phone:${normalized}` : "cleaner-login-phone:unknown";
}
