import { resolveReferralClientIp } from "@/lib/referrals/clientIp";

const WINDOW_MS = 60_000;
const IP_LIMIT = 60;
const SWEEP_AT_BUCKETS = 1_000;
const MAX_BUCKETS = 5_000;

const buckets = new Map<string, number[]>();

function sweepExpiredBuckets(now: number): void {
  for (const [key, timestamps] of buckets) {
    const active = timestamps.filter((timestamp) => now - timestamp < WINDOW_MS);
    if (active.length === 0) buckets.delete(key);
    else buckets.set(key, active);
  }

  while (buckets.size >= MAX_BUCKETS) {
    const oldestKey = buckets.keys().next().value as string | undefined;
    if (!oldestKey) break;
    buckets.delete(oldestKey);
  }
}

export type PromotionTelemetryRateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export function checkPromotionTelemetryRateLimit(
  request: Request,
): PromotionTelemetryRateLimitDecision {
  const ip = resolveReferralClientIp(request);
  const key = `promotion-telemetry:${ip}`;
  const now = Date.now();

  if (!buckets.has(key) && buckets.size >= SWEEP_AT_BUCKETS) {
    sweepExpiredBuckets(now);
  }

  const previous = buckets.get(key) ?? [];
  const active = previous.filter((timestamp) => now - timestamp < WINDOW_MS);

  if (active.length >= IP_LIMIT) {
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

export function promotionTelemetryRateLimitResponse(
  decision: Extract<PromotionTelemetryRateLimitDecision, { allowed: false }>,
): Response {
  return new Response(
    JSON.stringify({
      error: "Too many requests. Please try again shortly.",
      retryAfterSeconds: decision.retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(decision.retryAfterSeconds),
      },
    },
  );
}

/** Test-only. */
export function __resetPromotionTelemetryRateLimit(): void {
  buckets.clear();
}
