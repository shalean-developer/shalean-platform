/**
 * Abuse limiter for unauthenticated referral endpoints:
 *   POST /api/referrals/submit
 *   POST /api/referrals/validate-checkout
 */

import { resolveReferralClientIp } from "@/lib/referrals/clientIp";

const WINDOW_MS = 60_000;
const SUBMIT_IP_LIMIT = 8;
const SUBMIT_EMAIL_LIMIT = 4;
const VALIDATE_IP_LIMIT = 30;
const VALIDATE_INVALID_IP_LIMIT = 15;

const submitIpBuckets = new Map<string, number[]>();
const submitEmailBuckets = new Map<string, number[]>();
const validateIpBuckets = new Map<string, number[]>();
const validateInvalidIpBuckets = new Map<string, number[]>();

export type ReferralAbuseDecision =
  | { allowed: true }
  | { allowed: false; reason: string; retryAfterSeconds: number };

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

function toDecision(
  result: { allowed: true } | { allowed: false; retryAfterSeconds: number },
  reason: string,
): ReferralAbuseDecision {
  if (result.allowed) return { allowed: true };
  return { allowed: false, reason, retryAfterSeconds: result.retryAfterSeconds };
}

export function checkReferralSubmitIpLimit(request: Request): ReferralAbuseDecision {
  const ip = resolveReferralClientIp(request);
  return toDecision(consume(submitIpBuckets, `ref-submit-ip:${ip}`, SUBMIT_IP_LIMIT), "ip");
}

export function checkReferralSubmitEmailLimit(email: string): ReferralAbuseDecision {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return { allowed: true };
  return toDecision(
    consume(submitEmailBuckets, `ref-submit-email:${normalized}`, SUBMIT_EMAIL_LIMIT),
    "email",
  );
}

export function checkReferralValidateIpLimit(request: Request): ReferralAbuseDecision {
  const ip = resolveReferralClientIp(request);
  return toDecision(consume(validateIpBuckets, `ref-validate-ip:${ip}`, VALIDATE_IP_LIMIT), "ip");
}

/** Stricter bucket when validation fails — slows referral code guessing. */
export function recordReferralValidateFailure(request: Request): ReferralAbuseDecision {
  const ip = resolveReferralClientIp(request);
  return toDecision(
    consume(validateInvalidIpBuckets, `ref-validate-invalid-ip:${ip}`, VALIDATE_INVALID_IP_LIMIT),
    "invalid_attempts",
  );
}

export function referralRateLimitResponse(decision: Extract<ReferralAbuseDecision, { allowed: false }>): Response {
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

/** Test-only */
export function __resetReferralPublicAbuseBuckets(): void {
  submitIpBuckets.clear();
  submitEmailBuckets.clear();
  validateIpBuckets.clear();
  validateInvalidIpBuckets.clear();
}
