import { retiredApiJson } from "@/lib/http/retiredApiRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Retired duplicate scheduler entry — use `/api/cron/charge-monthly-invoices` only.
 * @deprecated
 */
export async function POST() {
  return retiredApiJson({
    message:
      "POST /api/cron/finalize-monthly-invoices is retired. Schedule /api/cron/charge-monthly-invoices instead.",
    successor: "/api/cron/charge-monthly-invoices",
  });
}

export async function GET() {
  return POST();
}
