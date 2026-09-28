const WINDOW_MS = 10 * 60_000;
const MAX_SUBMISSIONS_PER_IP = 6;

const buckets = new Map<string, number[]>();

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = request.headers.get("x-real-ip")?.trim();
  return forwarded || real || "unknown";
}

export function checkContactFormRateLimit(request: Request):
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number } {
  const key = clientIp(request);
  const now = Date.now();
  const previous = buckets.get(key) ?? [];
  const active = previous.filter((timestamp) => now - timestamp < WINDOW_MS);

  if (active.length >= MAX_SUBMISSIONS_PER_IP) {
    buckets.set(key, active);
    const oldest = active[0] ?? now;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000)),
    };
  }

  active.push(now);
  buckets.set(key, active);
  return { allowed: true };
}

/** Test-only. */
export function __resetContactFormRateLimit(): void {
  buckets.clear();
}
