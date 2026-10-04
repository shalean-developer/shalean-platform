import { resolveReferralClientIp } from "@/lib/referrals/clientIp";

const WINDOW_MS = 10 * 60_000;
const IP_LIMIT = 12;
const EMAIL_LIMIT = 4;

const ipBuckets = new Map<string, number[]>();
const emailBuckets = new Map<string, number[]>();

export type PublicQuoteAbuseDecision =
  | { allowed: true }
  | { allowed: false; reason: "ip" | "email"; retryAfterSeconds: number };

function consume(
  buckets: Map<string, number[]>,
  key: string,
  maxPerWindow: number,
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const now = Date.now();
  const prev = buckets.get(key) ?? [];
  const pruned = prev.filter((t) => now - t < WINDOW_MS);
  if (pruned.length >= maxPerWindow) {
    buckets.set(key, pruned);
    const oldest = pruned[0] ?? now;
    const remainingMs = Math.max(0, WINDOW_MS - (now - oldest));
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)) };
  }
  pruned.push(now);
  buckets.set(key, pruned);
  return { allowed: true };
}

export function checkPublicQuoteIpLimit(request: Request): PublicQuoteAbuseDecision {
  const ip = resolveReferralClientIp(request);
  const result = consume(ipBuckets, `quote-ip:${ip}`, IP_LIMIT);
  return result.allowed ? result : { ...result, reason: "ip" };
}

export function checkPublicQuoteEmailLimit(email: string): PublicQuoteAbuseDecision {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return { allowed: true };
  const result = consume(emailBuckets, `quote-email:${normalized}`, EMAIL_LIMIT);
  return result.allowed ? result : { ...result, reason: "email" };
}

export function publicQuoteRateLimitResponse(
  decision: Extract<PublicQuoteAbuseDecision, { allowed: false }>,
): Response {
  return new Response(
    JSON.stringify({
      error: "rate_limited",
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

/** Test-only */
export function __resetPublicQuoteAbuseBuckets(): void {
  ipBuckets.clear();
  emailBuckets.clear();
}
