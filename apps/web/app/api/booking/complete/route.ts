import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SR-02C tombstone: this legacy Paystack display/helper route is retired.
 * Use `/api/paystack/verify` for payment verification/finalization and
 * `/api/paystack/status` for read-only booking/payment status lookup.
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "Legacy booking completion helper is retired.",
      errorCode: "LEGACY_BOOKING_COMPLETE_RETIRED",
      canonicalVerify: "/api/paystack/verify",
      canonicalStatus: "/api/paystack/status",
    },
    { status: 410 },
  );
}
