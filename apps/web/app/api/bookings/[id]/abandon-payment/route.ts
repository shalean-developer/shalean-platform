import { NextResponse } from "next/server";
import {
  authenticateCustomerBookingRequest,
  handleCustomerPendingPaymentAbandon,
} from "@/lib/customer/customerBookingModifyHandlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: bookingIdRaw } = await ctx.params;
  const bookingId = bookingIdRaw?.trim() ?? "";
  if (!UUID_RE.test(bookingId)) {
    return NextResponse.json({ error: "Invalid booking." }, { status: 400 });
  }

  const auth = await authenticateCustomerBookingRequest(request);
  if (!auth.ok) return auth.response;

  return handleCustomerPendingPaymentAbandon(auth, bookingId);
}
