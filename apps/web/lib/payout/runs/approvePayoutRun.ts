import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { loadCleanerPayoutBatchItems } from "@/lib/payout/loadCleanerPayoutBatchItems";
import { isClosedMonthlyPayoutBatchPeriod } from "@/lib/payout/monthBounds";
import { loadCleanerPayoutFunding } from "@/lib/payout/payoutFunding";

/**
 * Approves a draft disbursement run and moves child `cleaner_payouts` from `frozen` → `approved`
 * so existing Paystack / mark-paid flows can execute. Every child must belong to a fully closed
 * Johannesburg monthly payout period and must be fully backed by collected customer cash.
 */
export async function approvePayoutRun(
  admin: SupabaseClient,
  runId: string,
  approvedBy?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: run, error: runErr } = await admin
    .from("cleaner_payout_runs")
    .select("id, status")
    .eq("id", runId)
    .maybeSingle();

  if (runErr) return { ok: false, error: runErr.message };
  if (!run || (run as { status?: string }).status !== "draft") {
    return { ok: false, error: "Run not found or not in draft status." };
  }

  const { data: children, error: childErr } = await admin
    .from("cleaner_payouts")
    .select("id, status, period_start, period_end")
    .eq("payout_run_id", runId);
  if (childErr) return { ok: false, error: childErr.message };
  if (!children?.length) return { ok: false, error: "Payout run has no cleaner payouts." };

  const openPeriod = children.find((row) => {
    const r = row as { period_start?: string | null; period_end?: string | null };
    return !isClosedMonthlyPayoutBatchPeriod(String(r.period_start ?? ""), String(r.period_end ?? ""));
  });
  if (openPeriod) {
    return {
      ok: false,
      error: "Payout run contains an open or invalid monthly period. Close the month before approval.",
    };
  }

  if (children.some((row) => String((row as { status?: string }).status ?? "") !== "frozen")) {
    return { ok: false, error: "All payouts in the run must be frozen before approval." };
  }

  let runFundingGapCents = 0;
  let unfundedPayouts = 0;
  for (const child of children) {
    const payoutId = String((child as { id?: string }).id ?? "").trim();
    if (!payoutId) continue;
    const loaded = await loadCleanerPayoutBatchItems(admin, payoutId);
    if (loaded.error) return { ok: false, error: loaded.error };
    const funding = await loadCleanerPayoutFunding(admin, payoutId, loaded.items);
    if (funding.error || !funding.summary) {
      return { ok: false, error: funding.error ?? "Could not verify payout funding." };
    }
    if (funding.summary.fundingGapCents > 0) {
      runFundingGapCents += funding.summary.fundingGapCents;
      unfundedPayouts += 1;
    }
  }

  if (runFundingGapCents > 0) {
    return {
      ok: false,
      error: `Payout run is not fully funded by collected customer cash. Funding gap: R ${(runFundingGapCents / 100).toFixed(2)} across ${unfundedPayouts} payout(s).`,
    };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: "approved", approved_at: now };
  if (approvedBy?.trim()) patch.approved_by = approvedBy.trim();

  const { data: updatedPayouts, error: upPayoutsErr } = await admin
    .from("cleaner_payouts")
    .update(patch)
    .eq("payout_run_id", runId)
    .eq("status", "frozen")
    .select("id");

  if (upPayoutsErr) return { ok: false, error: upPayoutsErr.message };
  if ((updatedPayouts?.length ?? 0) !== children.length) {
    return { ok: false, error: "Payout run changed during approval. Refresh and try again." };
  }

  const { data: updatedRun, error: upRunErr } = await admin
    .from("cleaner_payout_runs")
    .update({ status: "approved", approved_at: now })
    .eq("id", runId)
    .eq("status", "draft")
    .select("id");

  if (upRunErr) return { ok: false, error: upRunErr.message };
  if (!updatedRun?.length) return { ok: false, error: "Payout run changed during approval. Refresh and try again." };

  void logSystemEvent({
    level: "info",
    source: "payout_run_approved",
    message: "Approved fully funded closed-month cleaner payout run",
    context: { runId, childPayoutCount: children.length, approvedBy: approvedBy ?? null, fundingGapCents: 0 },
  });

  return { ok: true };
}
