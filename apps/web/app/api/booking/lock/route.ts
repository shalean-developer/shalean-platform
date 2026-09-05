import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Legacy booking lock tombstone.
 *
 * SR-02 permanently retires this customer booking path. Keeping an explicit
 * 410 response is safer than deleting the route immediately because older
 * clients receive a clear non-retryable response instead of silently falling
 * into another checkout path.
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "Legacy booking lock is retired. Use the booking-v2 checkout flow (/book or customer app).",
      errorCode: "LEGACY_BOOKING_LOCK_RETIRED",
      customerPricingSot: "booking_v2",
    },
    { status: 410 },
  );
}
