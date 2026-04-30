import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { markCleanerPayoutPaid } from "@/lib/payout/markPayoutPaid";
import { payCleanerPayoutWithPaystack } from "@/lib/payout/paystackPayout";
import { tryCloseDisbursementRunIfComplete } from "@/lib/payout/paystackTransferStatus";

export type ProcessPayoutRunResult = {
  runId: string;
  mode: "paystack" | "manual";
  /** Transfers sent (Paystack) or payouts marked paid (manual). */
  successCount: number;
  /** Already processing with Paystack or idempotent skip. */
  skippedInFlightCount: number;
  failedCount: number;
  errors: string[];
};

async function loadRun(admin: SupabaseClient, runId: string) {
  const { data: run, error: runErr } = await admin.from("cleaner_payout_runs").select("id, status").eq("id", runId).maybeSingle();
  if (runErr) throw new Error(runErr.message);
  return run as { id: string; status: string } | null;
}

/**
 * **Paystack (default when `PAYSTACK_SECRET_KEY` is set):** sends one transfer per child `cleaner_payouts`
 * via `payCleanerPayoutWithPaystack`; payouts become `paid` only after `transfer.success` webhooks
 * (`/api/webhooks/paystack`). The disbursement run is closed when all children are `paid`.
 *
 * **Manual:** marks each approved child paid synchronously (no Paystack); use for emergencies or dev.
 */
export async function processPayoutRun(
  admin: SupabaseClient,
  runId: string,
  opts: { paidBy: string; mode?: "paystack" | "manual" },
): Promise<ProcessPayoutRunResult> {
  const mode = opts.mode ?? (process.env.PAYSTACK_SECRET_KEY?.trim() ? "paystack" : "manual");
  if (mode === "paystack" && !process.env.PAYSTACK_SECRET_KEY?.trim()) {
    throw new Error("Paystack mode requires PAYSTACK_SECRET_KEY.");
  }
  if (mode === "manual") return processPayoutRunManual(admin, runId);
  return processPayoutRunPaystack(admin, runId, opts.paidBy);
}

async function processPayoutRunManual(admin: SupabaseClient, runId: string): Promise<ProcessPayoutRunResult> {
  const run = await loadRun(admin, runId);
  if (!run) throw new Error("Run not found.");
  const runStatus = run.status;
  if (runStatus === "paid") {
    const { data: paidRows } = await admin.from("cleaner_payouts").select("id").eq("payout_run_id", runId).eq("status", "paid");
    return {
      runId,
      mode: "manual",
      successCount: paidRows?.length ?? 0,
      skippedInFlightCount: 0,
      failedCount: 0,
      errors: [],
    };
  }

  if (runStatus === "draft") throw new Error("Approve the run before processing.");

  if (runStatus === "approved") {
    const { error: procErr } = await admin.from("cleaner_payout_runs").update({ status: "processing" }).eq("id", runId).eq("status", "approved");
    if (procErr) throw new Error(procErr.message);
  } else if (runStatus !== "processing") {
    throw new Error(`Run cannot be processed from status ${runStatus}.`);
  }

  const { data: payouts, error: pErr } = await admin.from("cleaner_payouts").select("id, status").eq("payout_run_id", runId);
  if (pErr) throw new Error(pErr.message);

  const errors: string[] = [];
  let successCount = 0;

  for (const p of payouts ?? []) {
    const id = String((p as { id?: string }).id ?? "");
    const st = String((p as { status?: string }).status ?? "");
    if (!id) continue;
    if (st === "paid") continue;
    if (st !== "approved") {
      errors.push(`${id}: expected approved, got ${st}`);
      continue;
    }
    const res = await markCleanerPayoutPaid(admin, id);
    if (!res.ok) errors.push(`${id}: ${res.error}`);
    else successCount += 1;
  }

  if (errors.length > 0) {
    void logSystemEvent({
      level: "error",
      source: "payout_run_process_partial",
      message: "cleaner_payout_runs manual processing failed for one or more child payouts",
      context: { runId, errors, successCount },
    });
    throw new Error(`Processing incomplete: ${errors.slice(0, 5).join("; ")}${errors.length > 5 ? "…" : ""}`);
  }

  const paidNow = new Date().toISOString();
  const { error: closeErr } = await admin
    .from("cleaner_payout_runs")
    .update({ status: "paid", paid_at: paidNow })
    .eq("id", runId);

  if (closeErr) throw new Error(closeErr.message);

  void logSystemEvent({
    level: "info",
    source: "payout_run_processed_manual",
    message: "Processed cleaner_payout_runs batch (manual mark paid)",
    context: { runId, successCount },
  });

  return { runId, mode: "manual", successCount, skippedInFlightCount: 0, failedCount: 0, errors: [] };
}

async function processPayoutRunPaystack(admin: SupabaseClient, runId: string, paidBy: string): Promise<ProcessPayoutRunResult> {
  const run = await loadRun(admin, runId);
  if (!run) throw new Error("Run not found.");
  const runStatus = run.status;

  if (runStatus === "paid") {
    return { runId, mode: "paystack", successCount: 0, skippedInFlightCount: 0, failedCount: 0, errors: [] };
  }

  if (runStatus === "draft") throw new Error("Approve the run before processing.");

  const batchRef = `shalean_disbursement_${runId}`;

  if (runStatus === "approved") {
    const { error: procErr } = await admin
      .from("cleaner_payout_runs")
      .update({ status: "processing", paystack_batch_ref: batchRef })
      .eq("id", runId)
      .eq("status", "approved");
    if (procErr) throw new Error(procErr.message);
  } else if (runStatus === "processing") {
    await admin.from("cleaner_payout_runs").update({ paystack_batch_ref: batchRef }).eq("id", runId).is("paystack_batch_ref", null);
  } else {
    throw new Error(`Run cannot be processed from status ${runStatus}.`);
  }

  const { data: payouts, error: pErr } = await admin.from("cleaner_payouts").select("id, status").eq("payout_run_id", runId);
  if (pErr) throw new Error(pErr.message);

  const errors: string[] = [];
  let successCount = 0;
  let skippedInFlightCount = 0;
  let failedCount = 0;

  for (const p of payouts ?? []) {
    const id = String((p as { id?: string }).id ?? "");
    const st = String((p as { status?: string }).status ?? "");
    if (!id) continue;
    if (st === "paid") {
      skippedInFlightCount += 1;
      continue;
    }
    if (st !== "approved") {
      errors.push(`${id}: expected approved for Paystack, got ${st}`);
      failedCount += 1;
      continue;
    }

    const res = await payCleanerPayoutWithPaystack(admin, { payoutId: id, paidBy });
    if (res.ok) {
      if (res.skippedExisting === true) skippedInFlightCount += 1;
      else successCount += 1;
      continue;
    }
    if (res.status === 409) {
      skippedInFlightCount += 1;
      continue;
    }
    failedCount += 1;
    errors.push(`${id}: ${res.error}`);
  }

  await tryCloseDisbursementRunIfComplete(admin, runId);

  void logSystemEvent({
    level: failedCount > 0 ? "warn" : "info",
    source: "payout_run_paystack_dispatched",
    message: "Dispatched Paystack transfers for cleaner_payout_runs batch",
    context: { runId, paidBy, successCount, skippedInFlightCount, failedCount, batchRef },
  });

  return { runId, mode: "paystack", successCount, skippedInFlightCount, failedCount, errors };
}
