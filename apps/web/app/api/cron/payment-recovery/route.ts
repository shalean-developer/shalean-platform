import { NextResponse } from "next/server";
import { acquireCronLock, releaseCronLock } from "@/lib/cron/cronLock";
import { CRON_LOCK_KEYS } from "@/lib/cron/cronLockKeys";
import { verifyCronSecret } from "@/lib/cron/verifyCronSecret";
import {
  processPaymentRecoveryJob,
  type PaymentRecoveryJobRow,
} from "@/lib/booking/processPaymentRecoveryJob";
import { logSystemEvent, reportOperationalIssue, logCronRun } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_JOBS = 50;

/**
 * Processes due `booking_payment_recovery_jobs` for unpaid bookings.
 * Vercel Cron: `Authorization: Bearer CRON_SECRET` (suggest every 15 minutes).
 */
export async function POST(request: Request) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const lockAcq = await acquireCronLock(supabase, {
    jobName: CRON_LOCK_KEYS.paymentRecovery,
    leaseSeconds: 600,
  });
  if (!lockAcq.ok) {
    return NextResponse.json({ ok: true, skipped: true, reason: lockAcq.reason });
  }

  try {
    const started = new Date().toISOString();
    await logSystemEvent({
      level: "info",
      source: "cron/payment-recovery",
      message: "Cron started",
      context: { started },
    });

    const nowIso = new Date().toISOString();
    const { data: jobs, error: jobErr } = await supabase
      .from("booking_payment_recovery_jobs")
      .select("id, job_type, customer_email, booking_id, attempts")
      .in("status", ["pending", "failed_retryable"])
      .lte("scheduled_for", nowIso)
      .order("scheduled_for", { ascending: true })
      .limit(MAX_JOBS);

    if (jobErr) {
      await reportOperationalIssue("error", "cron/payment-recovery", `load jobs: ${jobErr.message}`);
      await logSystemEvent({
        level: "error",
        source: "cron/payment-recovery",
        message: jobErr.message,
        context: {},
      });
      return NextResponse.json({ error: jobErr.message }, { status: 500 });
    }

    let sent = 0;
    let retry = 0;
    let terminal = 0;
    let skipped = 0;

    for (const row of jobs ?? []) {
      const r = await processPaymentRecoveryJob(supabase, row as PaymentRecoveryJobRow);
      if (r === "sent") sent++;
      else if (r === "retry") retry++;
      else if (r === "terminal") terminal++;
      else skipped++;
    }

    const finished = new Date().toISOString();
    const result = {
      started,
      finished,
      paymentRecoveryEmailsSent: sent,
      deferredRetry: retry,
      terminalFailures: terminal,
      skipped,
      batchSize: jobs?.length ?? 0,
    };

    await logSystemEvent({
      level: "info",
      source: "cron/payment-recovery",
      message: "Cron finished",
      context: result,
    });

    await logCronRun({
      jobName: "payment-recovery",
      status: "success",
      message: `sent=${sent} skipped=${skipped}`,
      context: result,
    });

    return NextResponse.json({ ok: true, ...result });
  } finally {
    await releaseCronLock(supabase, lockAcq.jobName, lockAcq.holderId);
  }
}

export async function GET(request: Request) {
  return POST(request);
}
