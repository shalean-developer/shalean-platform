import { retiredCleanerBookingRoute } from "@/lib/cleaner/retiredCleanerBookingRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** @deprecated Use `POST /api/cleaner/jobs/:id/on-the-way`. */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return retiredCleanerBookingRoute("en-route", id);
}
