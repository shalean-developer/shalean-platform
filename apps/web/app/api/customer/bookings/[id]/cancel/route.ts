import { NextResponse } from "next/server";
import {
  authenticateCustomerBookingRequest,
  handleCustomerBookingCancel,
} from "@/lib/customer/customerBookingModifyHandlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
  const auth = await authenticateCustomerBookingRequest(_request);
  if (!auth.ok) return auth.response;
  return handleCustomerBookingCancel(auth, bookingId);
}
