import { NextResponse } from "next/server";
import { acquireCronLock, releaseCronLock } from "@/lib/cron/cronLock";
import { CRON_LOCK_KEYS } from "@/lib/cron/cronLockKeys";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { processPaystackTransferOutboxBatch } from "@/lib/payout/paystackTransferExecutor";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Processes pending / needs_reconcile payout_transfer_outbox rows.
 * Resumes Paystack submission with the same immutable reference — never creates a new transfer id.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });

  const lockAcq = await acquireCronLock(supabase, {
    jobName: CRON_LOCK_KEYS.processPayoutTransferOutbox,
    leaseSeconds: 900,
  });
  if (!lockAcq.ok) {
    return NextResponse.json({ ok: true, skipped: true, reason: lockAcq.reason });
  }

  try {
    const batch = await processPaystackTransferOutboxBatch(supabase, { limit: 25 });
    const ok = batch.results.filter((r) => r.ok).length;
    const failed = batch.results.filter((r) => !r.ok).length;
    const needsReconcile = batch.results.filter((r) => ("needsReconcile" in r && r.needsReconcile) || (!r.ok && "needsReconcile" in r)).length;

    void logSystemEvent({
      level: failed ? "warn" : "info",
      source: "cron/process-payout-transfer-outbox",
      message: "Payout transfer outbox batch finished",
      context: { processed: batch.processed, ok, failed, needsReconcile },
    });

    return NextResponse.json({ ok: true, processed: batch.processed, succeeded: ok, failed, needsReconcile });
  } finally {
    await releaseCronLock(supabase, CRON_LOCK_KEYS.processPayoutTransferOutbox, lockAcq.holderId);
  }
}

export async function GET(request: Request) {
  return POST(request);
}
