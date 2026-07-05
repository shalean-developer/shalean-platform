import { retiredApiJson } from "@/lib/http/retiredApiRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** @deprecated Use `POST /api/customer/bookings/[id]/cancel`. */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
  return retiredApiJson({
    message: "POST /api/dashboard/bookings/[id]/cancel is retired. Use POST /api/customer/bookings/[id]/cancel.",
    successor: `/api/customer/bookings/${bookingId}/cancel`,
  });
}
