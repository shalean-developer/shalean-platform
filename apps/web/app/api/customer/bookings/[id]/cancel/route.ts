import {
  authenticateCustomerBookingRequest,
  handleCustomerBookingCancel,
} from "@/lib/customer/customerBookingModifyHandlers";
import { orchestrateCustomerBookingCancellation } from "@/lib/customer/orchestrateCustomerBookingCancellation";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
  const auth = await authenticateCustomerBookingRequest(_request);
  if (!auth.ok) return auth.response;

  const response = await handleCustomerBookingCancel(auth, bookingId);
  if (!response.ok) return response;

  // The booking mutation remains authoritative. Converge all secondary rails
  // only after cancellation succeeds so an operational-cleanup failure cannot
  // accidentally suppress work/messages for a booking that stayed active.
  const convergence = await orchestrateCustomerBookingCancellation(auth.admin, bookingId);
  if (!convergence.ok) {
    void reportOperationalIssue({
      source: "customer_booking_cancel",
      message: "customer_cancellation_side_effect_convergence_failed",
      context: { bookingId, error: convergence.error },
    });
  }

  return response;
}
