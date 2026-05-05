import { NextResponse } from "next/server";

import { assertMonthlyInvoiceFinalizeRunner } from "@/lib/cron/monthlyInvoiceFinalizeRunnerGuard";
import { finalizeDueMonthlyInvoices } from "@/lib/monthlyInvoice/finalizeDueMonthlyInvoices";
import { logSystemEvent } from "@/lib/logging/systemLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vercel / Supabase cron: `Authorization: Bearer CRON_SECRET` (Bearer only; no `x-cron-secret`).
 *
 * Same core logic as {@link finalizeDueMonthlyInvoices}: **closed invoice months only** (Johannesburg),
 * Paystack **initialize** + email — not card-on-file auto-charge.
 *
 * **Prefer** `/api/cron/charge-monthly-invoices` for new schedules (`verifyCronSecret` + `cron_runs` job name).
 * If keeping this URL: suggested **daily 23:55 Africa/Johannesburg** (align with `vercel.json` `charge-monthly-invoices`).
 *
 * Same optional runner guard as `charge-monthly-invoices`: {@link assertMonthlyInvoiceFinalizeRunner}.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const runnerGuard = assertMonthlyInvoiceFinalizeRunner(request);
  if (!runnerGuard.ok) {
    await logSystemEvent({
      level: "info",
      source: "cron/finalize-monthly-invoices",
      message: runnerGuard.reason,
      context: runnerGuard.context,
    });
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: runnerGuard.reason,
      context: runnerGuard.context,
    });
  }

  const result = await finalizeDueMonthlyInvoices();
  if (!result.ok) {
    return NextResponse.json({ error: result.reason ?? "finalize_failed" }, { status: 500 });
  }

  return NextResponse.json(result);
}

export async function GET(request: Request) {
  return POST(request);
}
