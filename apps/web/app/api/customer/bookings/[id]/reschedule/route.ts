import { NextResponse } from "next/server";
import {
  authenticateCustomerBookingRequest,
  handleCustomerBookingReschedule,
} from "@/lib/customer/customerBookingModifyHandlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
  const auth = await authenticateCustomerBookingRequest(request);
  if (!auth.ok) return auth.response;

  let body: { date?: string; time?: string };
  try {
    body = (await request.json()) as { date?: string; time?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  return handleCustomerBookingReschedule(auth, bookingId, body);
}
