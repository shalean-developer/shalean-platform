import { NextResponse } from "next/server";
import { validateLockForCheckout } from "@/lib/booking/checkoutLockValidation";
import { parseLockedBookingFromUnknown } from "@/lib/booking/lockedBooking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pre-flight checkout: expiry → lock version → **recompute** → signature → numeric parity.
 * Same rules as Paystack initialize before charging.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const lockedRaw =
    body !== null && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).locked
      : undefined;

  const locked = parseLockedBookingFromUnknown(lockedRaw);
  if (!locked) {
    return NextResponse.json(
      { ok: false, error: "Invalid lock snapshot.", errorCode: "INVALID_LOCK" },
      { status: 400 },
    );
  }

  const result = validateLockForCheckout(locked);
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
