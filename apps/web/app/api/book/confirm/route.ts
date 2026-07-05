import { retiredApiJson } from "@/lib/http/retiredApiRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** @deprecated Removed — use `POST /api/booking-v2/confirm`. */
export async function POST() {
  return retiredApiJson({
    message: "POST /api/book/confirm is retired. Use POST /api/booking-v2/confirm.",
    successor: "/api/booking-v2/confirm",
  });
}
