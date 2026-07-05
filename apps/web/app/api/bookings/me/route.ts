import { retiredApiJson } from "@/lib/http/retiredApiRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** @deprecated Removed — use `GET /api/customer/bookings`. */
export async function GET() {
  return retiredApiJson({
    message: "GET /api/bookings/me is retired. Use GET /api/customer/bookings.",
    successor: "/api/customer/bookings",
  });
}
