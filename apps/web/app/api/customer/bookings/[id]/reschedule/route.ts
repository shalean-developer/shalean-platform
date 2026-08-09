import { NextResponse } from "next/server";
import {
  authenticateCustomerBookingRequest,
  handleCustomerBookingReschedule,
} from "@/lib/customer/customerBookingModifyHandlers";
import { validateCustomerBookingRescheduleAssignment } from "@/lib/customer/validateCustomerBookingRescheduleAssignment";
import { orchestrateCustomerBookingReschedule } from "@/lib/customer/orchestrateCustomerBookingReschedule";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

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

  const date = typeof body.date === "string" ? body.date.trim() : "";
  const time = typeof body.time === "string" ? body.time.trim().slice(0, 5) : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time)) {
    const assignmentValidation = await validateCustomerBookingRescheduleAssignment(auth.admin, {
      userId: auth.userId,
      viewerEmail: auth.viewerEmail,
      bookingId,
      date,
      time,
    });
    if (!assignmentValidation.ok) {
      return NextResponse.json(
        { error: assignmentValidation.error },
        { status: assignmentValidation.status },
      );
    }
  }

  const response = await handleCustomerBookingReschedule(auth, bookingId, body);
  if (!response.ok) return response;

  const convergence = await orchestrateCustomerBookingReschedule(auth.admin, bookingId);
  if (!convergence.ok) {
    void reportOperationalIssue(
      "error",
      "customer_booking_reschedule",
      "customer_reschedule_side_effect_convergence_failed",
      { bookingId, error: convergence.error },
    );
    return NextResponse.json(
      { ok: true, warning: "Booking moved, but assignment refresh needs operations review." },
      { status: 200 },
    );
  }

  return response;
}
