import { retiredApiJson } from "@/lib/http/retiredApiRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** @deprecated Removed — use `/book` + `POST /api/booking-v2/confirm`. */
export async function POST() {
  return retiredApiJson({
    message: "POST /api/bookings/flow-intake is retired. Book at /book and confirm via POST /api/booking-v2/confirm.",
    successor: "/api/booking-v2/confirm",
  });
}
