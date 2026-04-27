import { NextResponse } from "next/server";
import { loadPayBookingLanding } from "@/lib/pay/payBookingLanding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await ctx.params;
  const ref = new URL(request.url).searchParams.get("ref")?.trim() ?? "";
  const land = await loadPayBookingLanding(bookingId, ref);
  if (!land.ok) {
    return NextResponse.json(
      { error: land.error, ...(land.payment_status != null ? { payment_status: land.payment_status } : {}) },
      { status: land.httpStatus },
    );
  }
  return NextResponse.json({
    ok: true,
    bookingId: land.bookingId,
    serviceLabel: land.serviceLabel,
    date: land.date,
    time: land.time,
    amountZar: land.amountZar,
    authorizationUrl: land.authorizationUrl,
    payment_link_expires_at: land.payment_link_expires_at,
    payment_status: "pending" as const,
  });
}
