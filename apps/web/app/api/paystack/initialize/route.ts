/**
 * **Responsibility:** Start checkout — creates/updates `pending_payment` booking state and returns Paystack `authorization_url` / `reference`.
 * Does **not** finalize paid bookings; see `lib/booking/paystackRouteResponsibilityContract.ts`.
 *
 * **M-4 abuse protection (May 2026)**: this endpoint is unauthenticated to support guest
 * checkout. To prevent payment-link spam / Paystack-side abuse / DoS via a flood of
 * `pending_payment` rows, we apply conservative IP + email + bookingId windowed rate limits via
 * `lib/rateLimit/paystackInitializeAbuseLimit.ts`. Limits are sized so legitimate "click pay
 * twice on flaky network", "auth retry after redirect", and "shared NAT" scenarios pass.
 *
 * Admin paths (`/api/admin/bookings/with-payment`, `/api/admin/bookings`) and the AI booking
 * agent path (`/api/ai/booking-agent`) call `processPaystackInitializeBody` directly and are
 * intentionally NOT subject to this limiter (admin auth + idempotency cover those).
 */
import { NextResponse } from "next/server";
import { processPaystackInitializeBody } from "@/lib/booking/paystackInitializeCore";
import {
  checkPaystackInitializeBodyLimits,
  checkPaystackInitializeIpLimit,
} from "@/lib/rateLimit/paystackInitializeAbuseLimit";

function tooManyRequests(reason: "ip" | "email" | "bookingId", retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please wait a moment before trying again." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Reason": `paystack-initialize:${reason}`,
      },
    },
  );
}

export async function POST(request: Request) {
  /**
   * M-4: IP-bucket check runs BEFORE body parsing so a flood of malformed-JSON requests from
   * the same source still consumes the limiter (otherwise an attacker would hammer with junk
   * payloads, all returning 400, but each round-tripping through Next.js).
   */
  const ipDecision = checkPaystackInitializeIpLimit(request);
  if (!ipDecision.allowed) {
    return tooManyRequests(ipDecision.reason, ipDecision.retryAfterSeconds);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const bodyDecision = checkPaystackInitializeBodyLimits(body);
  if (!bodyDecision.allowed) {
    return tooManyRequests(bodyDecision.reason, bodyDecision.retryAfterSeconds);
  }

  const raw = body as Record<string, unknown>;
  const { relaxedLockValidation: _relaxed, ...safeBody } = raw;
  void _relaxed;

  const forwarded = request.headers.get("x-forwarded-for");
  const clientIp =
    (typeof forwarded === "string" && forwarded.split(",")[0]?.trim()) ||
    request.headers.get("x-real-ip")?.trim() ||
    null;
  const userAgent = request.headers.get("user-agent")?.trim() || null;

  const result = await processPaystackInitializeBody(safeBody, {
    checkoutTrustSignals: { clientIp, userAgent },
  });
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        ...(result.errorCode != null ? { errorCode: result.errorCode } : {}),
      },
      { status: result.status },
    );
  }

  return NextResponse.json({
    authorizationUrl: result.authorizationUrl,
    reference: result.reference,
    ...(result.bookingId ? { bookingId: result.bookingId } : {}),
  });
}
