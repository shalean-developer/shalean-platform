import { NextResponse } from "next/server";

import { withCronLock } from "@/lib/cron/cronLock";
import { CRON_LOCK_KEYS } from "@/lib/cron/cronLockKeys";
import { assertMonthlyInvoiceFinalizeRunner } from "@/lib/cron/monthlyInvoiceFinalizeRunnerGuard";
import { verifyCronSecret } from "@/lib/cron/verifyCronSecret";
import { finalizeDueMonthlyInvoices } from "@/lib/monthlyInvoice/finalizeDueMonthlyInvoices";
import { logCronRun, logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron: same auth as other `/api/cron/*` routes (`verifyCronSecret`).
 *
 * **Monthly billing execution** (closes the loop after recurring generation):
 * idempotent finalize for draft `monthly_invoices` whose invoice **month has ended** (Johannesburg calendar gate),
 * then Paystack **initialize** (hosted link) + email — **not** automatic `charge_authorization` / card-on-file.
 *
 * **`paid`** is applied when Paystack sends `charge.success` and {@link applyMonthlyInvoicePayment} runs (webhook).
 *
 * **Schedule:** daily — **23:55 Africa/Johannesburg** recommended (`55 21 * * *` UTC in `vercel.json`).
 * Schedule **`finalize-monthly-invoices` OR this route**, not both, unless you intend duplicate finalize attempts.
 *
 * Prefer this route over `finalize-monthly-invoices` for shared `verifyCronSecret` + `cron_runs` (`charge-monthly-invoices`).
 *
 * Optional duplicate-scheduler lock: set `MONTHLY_INVOICE_FINALIZE_REQUIRE_RUNNER` + matching `CRON_SOURCE` or
 * `x-monthly-finalize-runner` header (see {@link assertMonthlyInvoiceFinalizeRunner}).
 */
export async function POST(request: Request) {
  const cronAuth = verifyCronSecret(request);
  if (!cronAuth.ok) {
    if (cronAuth.status !== 401) {
      await logCronRun({
        jobName: "charge-monthly-invoices",
        status: "error",
        message: `[auth] ${cronAuth.body.error}`,
      });
    }
    return NextResponse.json(cronAuth.body, { status: cronAuth.status });
  }

  const runnerGuard = assertMonthlyInvoiceFinalizeRunner(request);
  if (!runnerGuard.ok) {
    await logSystemEvent({
      level: "info",
      source: "cron/charge-monthly-invoices",
      message: runnerGuard.reason,
      context: runnerGuard.context,
    });
    await logCronRun({
      jobName: "charge-monthly-invoices",
      status: "success",
      message: JSON.stringify({ skipped: true, reason: runnerGuard.reason, ...runnerGuard.context }),
    });
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: runnerGuard.reason,
      context: runnerGuard.context,
      finalized: 0,
      settlement: "paystack_webhook" as const,
    });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    await logCronRun({
      jobName: "charge-monthly-invoices",
      status: "error",
      message: "[env] Supabase not configured.",
    });
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  /* H-15: shared lock with finalize-monthly-invoices so two schedulers can't double-finalize / double-link. */
  const lockResult = await withCronLock(
    admin,
    { jobName: CRON_LOCK_KEYS.monthlyInvoiceFinalize, leaseSeconds: 1200 },
    () => finalizeDueMonthlyInvoices(),
  );
  if (lockResult.skipped) {
    await logCronRun({
      jobName: "charge-monthly-invoices",
      status: "success",
      message: JSON.stringify({ skipped: true, reason: lockResult.reason }),
    });
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: lockResult.reason,
      finalized: 0,
      settlement: "paystack_webhook" as const,
    });
  }
  const result = lockResult.ranIt;

  const body = {
    ok: result.ok,
    today: result.today,
    finalized: result.finalized ?? 0,
    errors: result.errors,
    /** Hosted payment link; settlement async via webhook. */
    settlement: "paystack_webhook" as const,
  };

  if (!result.ok) {
    await reportOperationalIssue("error", "cron/charge-monthly-invoices", result.reason ?? "finalize_failed");
    await logCronRun({
      jobName: "charge-monthly-invoices",
      status: "error",
      message: result.reason ?? "finalize_failed",
    });
    return NextResponse.json(body, { status: 500 });
  }

  const partialErrors = result.errors ?? [];
  if (partialErrors.length) {
    const detail = {
      today: result.today,
      finalized: result.finalized ?? 0,
      error_count: partialErrors.length,
      errors: partialErrors,
    };
    await reportOperationalIssue("error", "cron/charge-monthly-invoices", "partial_finalize_failure", detail);
    await logCronRun({
      jobName: "charge-monthly-invoices",
      status: "error",
      message: JSON.stringify(detail),
    });
    return NextResponse.json({ ...body, ok: false }, { status: 500 });
  }

  await logCronRun({
    jobName: "charge-monthly-invoices",
    status: "success",
    message: JSON.stringify({
      today: result.today,
      finalized: result.finalized ?? 0,
      error_count: 0,
    }),
  });

  return NextResponse.json(body);
}

export async function GET(request: Request) {
  return POST(request);
}
