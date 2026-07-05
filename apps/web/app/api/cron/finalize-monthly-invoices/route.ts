import { NextResponse } from "next/server";

import { withCronLock } from "@/lib/cron/cronLock";
import { CRON_LOCK_KEYS } from "@/lib/cron/cronLockKeys";
import { verifyCronSecret } from "@/lib/cron/verifyCronSecret";
import { retiredApiJson } from "@/lib/http/retiredApiRoute";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Retired duplicate scheduler entry — use `/api/cron/charge-monthly-invoices` only.
 * @deprecated
 */
async function handleRetired() {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const lockResult = await withCronLock(
    admin,
    { jobName: CRON_LOCK_KEYS.monthlyInvoiceFinalize, leaseSeconds: 1200 },
    async () =>
      retiredApiJson({
        message:
          "POST /api/cron/finalize-monthly-invoices is retired. Schedule /api/cron/charge-monthly-invoices instead.",
        successor: "/api/cron/charge-monthly-invoices",
      }),
  );

  if (lockResult.skipped) {
    return NextResponse.json({ ok: true, skipped: true, reason: lockResult.reason });
  }
  return lockResult.ranIt;
}

export async function POST(request: Request) {
  const cronAuth = verifyCronSecret(request);
  if (!cronAuth.ok) {
    return NextResponse.json(cronAuth.body, { status: cronAuth.status });
  }
  return handleRetired();
}

export async function GET(request: Request) {
  return POST(new Request(request.url, { method: "POST", headers: request.headers }));
}
