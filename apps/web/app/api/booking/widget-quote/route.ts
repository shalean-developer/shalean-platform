import { retiredApiJson } from "@/lib/http/retiredApiRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** @deprecated Removed — book at `/book` (booking-v2). */
export async function POST() {
  return retiredApiJson({
    message: "POST /api/booking/widget-quote is retired. Use /book for customer checkout.",
    successor: "/book",
  });
}
