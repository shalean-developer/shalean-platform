import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SR-02C tombstone: this legacy success-page polling route is retired.
 * Use `/api/paystack/status` for read-only booking/payment status lookup and
 * `/api/paystack/verify` for canonical verification/finalization.
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: "Legacy booking status route is retired.",
      errorCode: "LEGACY_BOOKING_STATUS_RETIRED",
      canonicalStatus: "/api/paystack/status",
      canonicalVerify: "/api/paystack/verify",
    },
    { status: 410 },
  );
}
