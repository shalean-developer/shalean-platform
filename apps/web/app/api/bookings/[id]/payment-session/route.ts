/**
 * **Responsibility:** Recover or create a usable Paystack checkout session for an existing booking.
 * Does not mark bookings paid. Amount is always taken from the booking row.
 */
import { NextResponse } from "next/server";
import { ensureBookingPaymentSession } from "@/lib/booking/ensureBookingPaymentSession";
import { resolveBookingRouteBearerAuth } from "@/lib/supabase/bookingRouteBearerAuth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  checkPaystackInitializeBodyLimits,
  checkPaystackInitializeIpLimit,
} from "@/lib/rateLimit/paystackInitializeAbuseLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Body = {
  reference?: string;
  /** Browser GA4 `_ga` client id (`1234567890.1234567890`) for MP purchase stitching. */
  gaClientId?: string;
  ga_client_id?: string;
  /** Browser GA4 session id when available. */
  gaSessionId?: string;
  ga_session_id?: string;
};

function parseGaIdentity(body: Body): { gaClientId?: string; gaSessionId?: string } | undefined {
  const clientRaw =
    (typeof body.gaClientId === "string" && body.gaClientId.trim()) ||
    (typeof body.ga_client_id === "string" && body.ga_client_id.trim()) ||
    "";
  const sessionRaw =
    (typeof body.gaSessionId === "string" && body.gaSessionId.trim()) ||
    (typeof body.ga_session_id === "string" && body.ga_session_id.trim()) ||
    "";
  const gaClientId = /^\d+\.\d+$/.test(clientRaw) ? clientRaw : undefined;
  const gaSessionId = /^\d+$/.test(sessionRaw) ? sessionRaw : undefined;
  if (!gaClientId && !gaSessionId) return undefined;
  return { gaClientId, gaSessionId };
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingIdRaw } = await ctx.params;
  const bookingId = bookingIdRaw?.trim() ?? "";
  if (!UUID_RE.test(bookingId)) {
    return NextResponse.json(
      { status: "failed", error: "Invalid booking.", errorCode: "PAYMENT_BOOKING_NOT_FOUND", retryable: false },
      { status: 400 },
    );
  }

  const ipLimit = checkPaystackInitializeIpLimit(request);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      {
        status: "failed",
        error: "Too many payment attempts. Please wait a moment and try again.",
        errorCode: "PAYMENT_INITIALIZATION_FAILED",
        retryable: true,
      },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } },
    );
  }

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }

  const bodyLimit = checkPaystackInitializeBodyLimits({ bookingId, ...body });
  if (!bodyLimit.allowed) {
    return NextResponse.json(
      {
        status: "failed",
        error: "Too many payment attempts. Please wait a moment and try again.",
        errorCode: "PAYMENT_INITIALIZATION_FAILED",
        retryable: true,
      },
      { status: 429, headers: { "Retry-After": String(bodyLimit.retryAfterSeconds) } },
    );
  }

  const reference = typeof body.reference === "string" ? body.reference.trim() : "";

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      {
        status: "failed",
        bookingId,
        error: "Service unavailable.",
        errorCode: "PAYMENT_CONFIGURATION_ERROR",
        retryable: true,
      },
      { status: 503 },
    );
  }

  const auth = await resolveBookingRouteBearerAuth(request);
  if (auth.kind === "invalid_token") {
    return NextResponse.json(
      {
        status: "failed",
        bookingId,
        error: auth.message,
        errorCode: "PAYMENT_ACCESS_DENIED",
        retryable: false,
      },
      { status: auth.status },
    );
  }

  const userId = auth.kind === "authenticated" ? auth.userId.trim() : "";

  let access:
    | { kind: "paystack_ref"; reference: string }
    | { kind: "owner"; userId: string }
    | null = null;

  if (reference) {
    access = { kind: "paystack_ref", reference };
  } else if (userId) {
    access = { kind: "owner", userId };
  }

  if (!access) {
    return NextResponse.json(
      {
        status: "failed",
        bookingId,
        error: "Sign in or open the pay link from your email to continue payment.",
        errorCode: "PAYMENT_ACCESS_DENIED",
        retryable: false,
      },
      { status: 401 },
    );
  }

  const session = await ensureBookingPaymentSession(admin, {
    bookingId,
    access,
    gaIdentity: parseGaIdentity(body),
  });

  if (session.status === "paid") {
    return NextResponse.json({
      status: "paid",
      bookingId: session.bookingId,
      reference: session.reference,
      errorCode: session.errorCode,
    });
  }

  if (session.status === "failed") {
    const http =
      session.errorCode === "PAYMENT_ACCESS_DENIED"
        ? 403
        : session.errorCode === "PAYMENT_BOOKING_NOT_FOUND"
          ? 404
          : session.errorCode === "PAYMENT_ALREADY_COMPLETED"
            ? 409
            : session.retryable
              ? 503
              : 409;
    return NextResponse.json(
      {
        status: "failed",
        bookingId: session.bookingId,
        error: session.error,
        errorCode: session.errorCode,
        retryable: session.retryable,
      },
      { status: http },
    );
  }

  return NextResponse.json({
    status: "ready",
    bookingId: session.bookingId,
    reference: session.reference,
    authorizationUrl: session.authorizationUrl,
    reused: session.reused,
    refreshed: session.refreshed,
    message: session.message,
    payment_link_expires_at: session.payment_link_expires_at,
  });
}
