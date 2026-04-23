import { NextResponse } from "next/server";
import { validateLockForCheckout } from "@/lib/booking/checkoutLockValidation";
import { parseLockedBookingFromUnknown } from "@/lib/booking/lockedBooking";
import { resolveRatesSnapshotForLockedBooking } from "@/lib/booking/resolveRatesSnapshot";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pre-flight checkout: expiry → **recompute** → signature → numeric parity.
 * Same rules as Paystack initialize before charging.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const bodyRec = body !== null && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  const lockedRaw = bodyRec?.locked;

  const bookingIdRaw = bodyRec?.bookingId ?? bodyRec?.booking_id;
  const bookingIdPreflight =
    typeof bookingIdRaw === "string" && bookingIdRaw.trim() ? bookingIdRaw.trim() : null;

  const locked = parseLockedBookingFromUnknown(lockedRaw);
  if (!locked) {
    return NextResponse.json(
      { ok: false, error: "Invalid lock snapshot.", errorCode: "INVALID_LOCK" },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "Checkout is temporarily unavailable.", errorCode: "PRICING_SNAPSHOT_MISSING" },
      { status: 503 },
    );
  }

  const ratesSnapshot = await resolveRatesSnapshotForLockedBooking(admin, locked);
  if (!ratesSnapshot) {
    return NextResponse.json(
      { ok: false, error: "Pricing record not found. Pick your time again.", errorCode: "PRICING_SNAPSHOT_MISSING" },
      { status: 400 },
    );
  }

  const result = validateLockForCheckout(locked, Date.now(), {
    ratesSnapshot,
    bookingId: bookingIdPreflight,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.message, errorCode: result.code },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    valid: true,
    visitTotalZar: result.visitTotalZar,
    hours: result.serverQuote?.hours ?? null,
  });
}
