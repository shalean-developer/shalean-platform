/**
 * **M-4 abuse limiter for `POST /api/paystack/initialize`** (customer-facing checkout).
 *
 * Why this exists: the customer Paystack initialize endpoint is unauthenticated (guest checkout
 * is intentionally supported), persists a `pending_payment` row, and calls Paystack's
 * `/transaction/initialize` API. Without a limiter, an attacker could cheaply spam payment-link
 * generation, abuse Paystack rate limits, and pollute the bookings table with abandoned rows.
 *
 * Scope: this module is wired only into `apps/web/app/api/paystack/initialize/route.ts`. It is
 * NOT applied to:
 *   - `POST /api/admin/bookings/with-payment` (admin auth-gated, has its own idempotency layer
 *     under M-3),
 *   - `POST /api/admin/bookings` (admin auth-gated),
 *   - `POST /api/ai/booking-agent` (LLM tool path, separate trust model).
 *
 * Design:
 *   - Three independent windowed buckets (IP / email / bookingId) — first hit returns 429.
 *   - Conservative limits sized so legitimate "click pay twice on a slow network", "auth retry",
 *     or "shared NAT" patterns are never blocked, while sustained automated abuse trips quickly.
 *   - In-process Map (same pattern as `paystackVerifyIpLimit.ts` and
 *     `offerSmsTrackedLinkIpLimit.ts`). Per-instance state is sufficient for abuse protection;
 *     a global limiter belongs at the edge / WAF layer and is not in scope for M-4.
 *   - Pure: bucket state lives in module-scope Maps; `__resetPaystackInitializeAbuseBuckets`
 *     is exported solely for vitest determinism.
 */

const WINDOW_MS = 60_000;

const IP_LIMIT_PER_WINDOW = 15;
const EMAIL_LIMIT_PER_WINDOW = 6;
const BOOKING_ID_LIMIT_PER_WINDOW = 5;

const ipBuckets = new Map<string, number[]>();
const emailBuckets = new Map<string, number[]>();
const bookingIdBuckets = new Map<string, number[]>();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PaystackInitializeAbuseDecision =
  | { allowed: true }
  | { allowed: false; reason: "ip" | "email" | "bookingId"; retryAfterSeconds: number; key: string };

/**
 * Resolve the client IP for rate-limit keying. Mirrors `paystackVerifyIpLimit.ts` so an attacker
 * cannot trivially evade by toggling between the two endpoints from the same proxy chain.
 */
export function resolvePaystackInitializeClientIp(request: Request): string {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) {
    const first = xf.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

/**
 * Phase 1 — IP-only check. Run BEFORE body parsing so junk-body floods cannot bypass the limit.
 * Side-effecting: appends `now` to the IP bucket on success.
 */
export function checkPaystackInitializeIpLimit(request: Request): PaystackInitializeAbuseDecision {
  const ip = resolvePaystackInitializeClientIp(request);
  const ipKey = `init-ip:${ip}`;
  const ipDecision = consume(ipBuckets, ipKey, IP_LIMIT_PER_WINDOW);
  if (!ipDecision.allowed) {
    return { allowed: false, reason: "ip", retryAfterSeconds: ipDecision.retryAfterSeconds, key: ipKey };
  }
  return { allowed: true };
}

/**
 * Phase 2 — payload-aware checks. Run AFTER the route validates `body` is JSON-parseable.
 * Email is normalized to lowercase + trimmed; non-string / empty values are skipped (legitimate
 * shape errors will fail validation in `processPaystackInitializeBody` and return a 400).
 *
 * `bookingId` is checked only when present and UUID-shaped (the existing legitimate
 * "retry-existing-pending-payment" path); shorter or non-UUID values are skipped to avoid
 * false-positives on garbage inputs.
 */
export function checkPaystackInitializeBodyLimits(body: unknown): PaystackInitializeAbuseDecision {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { allowed: true };
  const raw = body as Record<string, unknown>;

  const emailRaw = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
  if (emailRaw.length > 0 && emailRaw.length < 320) {
    const emailKey = `init-email:${emailRaw}`;
    const decision = consume(emailBuckets, emailKey, EMAIL_LIMIT_PER_WINDOW);
    if (!decision.allowed) {
      return { allowed: false, reason: "email", retryAfterSeconds: decision.retryAfterSeconds, key: emailKey };
    }
  }

  const bookingIdRaw = typeof raw.bookingId === "string" ? raw.bookingId.trim() : "";
  if (bookingIdRaw.length > 0 && UUID_RE.test(bookingIdRaw)) {
    const bookingKey = `init-booking:${bookingIdRaw.toLowerCase()}`;
    const decision = consume(bookingIdBuckets, bookingKey, BOOKING_ID_LIMIT_PER_WINDOW);
    if (!decision.allowed) {
      return { allowed: false, reason: "bookingId", retryAfterSeconds: decision.retryAfterSeconds, key: bookingKey };
    }
  }

  return { allowed: true };
}

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

export const PAYSTACK_INITIALIZE_ABUSE_LIMITS = Object.freeze({
  windowMs: WINDOW_MS,
  ipPerWindow: IP_LIMIT_PER_WINDOW,
  emailPerWindow: EMAIL_LIMIT_PER_WINDOW,
  bookingIdPerWindow: BOOKING_ID_LIMIT_PER_WINDOW,
});

/** Test-only: clears all in-memory buckets. Do not call from production code. */
export function __resetPaystackInitializeAbuseBuckets(): void {
  ipBuckets.clear();
  emailBuckets.clear();
  bookingIdBuckets.clear();
}
