import { NextResponse } from "next/server";

import { withCronLock } from "@/lib/cron/cronLock";
import { CRON_LOCK_KEYS } from "@/lib/cron/cronLockKeys";
import { todayJohannesburg } from "@/lib/recurring/johannesburgCalendar";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sets `is_overdue` and `account_billing_risk` via DB RPC (does not replace `partially_paid` with a status of overdue).
 *
 * Suggested: daily with CRON_SECRET → POST /api/cron/mark-monthly-invoices-overdue
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });

  const today = todayJohannesburg();

  /* H-15: serialize overdue marking — duplicate runs would call the RPC twice and could log
   * duplicate billing-risk events. RPC itself is idempotent on flags but observability stays cleaner.
   *
   * `admin.rpc(...)` returns a `PostgrestFilterBuilder` (thenable but not a strict `Promise<T>`,
   * missing `catch`/`finally`/`[Symbol.toStringTag]`), and `withCronLock`'s `fn` param is typed
   * as `() => Promise<T>`. Wrapping with `async` makes the function's return type
   * `Promise<PostgrestSingleResponse<...>>` so the structural check passes — same pattern used
   * by every other cron-lock caller (`expire-pending-payments`, `generate-payouts`, etc.). */
  const lockResult = await withCronLock(
    admin,
    { jobName: CRON_LOCK_KEYS.markMonthlyInvoicesOverdue, leaseSeconds: 300 },
    async () => admin.rpc("mark_monthly_invoice_overdue_flags", { p_today: today }),
  );
  if (lockResult.skipped) {
    return NextResponse.json({ ok: true, skipped: true, reason: lockResult.reason, today });
  }
  const { data: rpcData, error } = lockResult.ranIt;

  if (error) {
    await reportOperationalIssue("error", "cron/mark-monthly-invoices-overdue", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const updated = typeof rpcData === "number" ? rpcData : Number(rpcData ?? 0);

  await logSystemEvent({
    level: "info",
    source: "cron/mark-monthly-invoices-overdue",
    message: "overdue_mark_done",
    context: { today, invoices_flagged: updated },
  });

  return NextResponse.json({ ok: true, today, invoices_flagged: updated });
}

export async function GET(request: Request) {
  return POST(request);
}
