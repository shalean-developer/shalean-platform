import { retiredApiJson } from "@/lib/http/retiredApiRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** @deprecated Use `PATCH /api/customer/bookings/[id]/reschedule`. */
export async function PATCH(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
  return retiredApiJson({
    message: "PATCH /api/dashboard/bookings/[id]/reschedule is retired. Use PATCH /api/customer/bookings/[id]/reschedule.",
    successor: `/api/customer/bookings/${bookingId}/reschedule`,
  });
}
