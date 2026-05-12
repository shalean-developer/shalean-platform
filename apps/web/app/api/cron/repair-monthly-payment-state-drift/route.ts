import { NextResponse } from "next/server";

import { withCronLock } from "@/lib/cron/cronLock";
import { CRON_LOCK_KEYS } from "@/lib/cron/cronLockKeys";
import { verifyCronSecret } from "@/lib/cron/verifyCronSecret";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { repairMonthlyInvoicePaymentStateDriftProbeE } from "@/lib/monthlyInvoice/repairMonthlyInvoicePaymentStateDriftProbeE";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Phase 10D: bounded `payment_state` refresh for Probe E drift (no billing / payout / invoice changes).
 *
 * Suggested: weekly — same auth as other `/api/cron/*` (`verifyCronSecret`: Bearer or `x-cron-secret`).
 * Optional query: `?repairLimit=200&scanLimit=2000` (clamped server-side).
 */
export async function POST(request: Request) {
  const cronAuth = verifyCronSecret(request);
  if (!cronAuth.ok) {
    return NextResponse.json(cronAuth.body, { status: cronAuth.status });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });

  const url = new URL(request.url);
  const repairLimit = Number(url.searchParams.get("repairLimit") ?? "");
  const scanLimit = Number(url.searchParams.get("scanLimit") ?? "");

  /* H-15: serialize Probe E repair — duplicate runs could double-stamp `payment_state` refreshes. */
  const lockResult = await withCronLock(
    admin,
    { jobName: CRON_LOCK_KEYS.repairMonthlyPaymentStateDrift, leaseSeconds: 600 },
    () =>
      repairMonthlyInvoicePaymentStateDriftProbeE(admin, {
        repairLimit: Number.isFinite(repairLimit) && repairLimit > 0 ? repairLimit : undefined,
        scanLimit: Number.isFinite(scanLimit) && scanLimit > 0 ? scanLimit : undefined,
      }),
  );
  if (lockResult.skipped) {
    return NextResponse.json({ ok: true as const, skipped: true, reason: lockResult.reason });
  }
  const result = lockResult.ranIt;

  if (!result.ok) {
    await reportOperationalIssue("error", "cron/repair-monthly-payment-state-drift", result.error);
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const { ok: _ok, ...body } = result;
  return NextResponse.json({ ok: true as const, ...body });
}

export async function GET(request: Request) {
  return POST(request);
}
