import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { metrics } from "@/lib/metrics/counters";

export type CleanerPayoutRunRow = {
  id: string;
  status: string;
  total_amount_cents: number;
  created_at: string;
  approved_at: string | null;
  paid_at: string | null;
};

/**
 * Groups all frozen weekly payouts that are not yet on a run into a new draft `cleaner_payout_runs` row.
 *
 * M-18 race-loss handling: the post-insert update is guarded by `payout_run_id IS NULL` so that
 * if a concurrent `createPayoutRun` runner already linked the same frozen `cleaner_payouts` rows
 * to a different run, this caller's update affects 0 rows and we delete the just-inserted empty
 * `cleaner_payout_runs` row instead of silently overwriting the winner's link. This is the
 * defense-in-depth pair to the H-15 cron lock on `cron:create-payout-run`: the cron lock is the
 * primary fence, but if it fails open or an admin manual replay races, the DB-level guard here
 * (plus the symmetric `cleaner_payouts_unique_active_period_idx` invariant on the upstream
 * `cleaner_payouts` insert) prevents orphan run rows or link-hijacking.
 */
export async function createPayoutRun(admin: SupabaseClient): Promise<CleanerPayoutRunRow | null> {
  const { data: payouts, error: selErr } = await admin
    .from("cleaner_payouts")
    .select("id, total_amount_cents")
    .eq("status", "frozen")
    .is("payout_run_id", null);

  if (selErr) throw new Error(selErr.message);
  const list = payouts ?? [];
  if (!list.length) return null;

  const total = list.reduce((s, p) => s + Math.max(0, Math.floor(Number((p as { total_amount_cents?: number }).total_amount_cents) || 0)), 0);

  const { data: run, error: insErr } = await admin
    .from("cleaner_payout_runs")
    .insert({ total_amount_cents: total, status: "draft" })
    .select("id, status, total_amount_cents, created_at, approved_at, paid_at")
    .single();

  if (insErr || !run) throw new Error(insErr?.message ?? "insert cleaner_payout_runs failed");

  const runRow = run as CleanerPayoutRunRow;
  const ids = list.map((p) => String((p as { id: string }).id));

  const { data: linked, error: upErr } = await admin
    .from("cleaner_payouts")
    .update({ payout_run_id: runRow.id })
    .in("id", ids)
    /**
     * M-18: link-claim guard. Without this filter, two concurrent createPayoutRun runners
     * (e.g. cron + admin manual replay, or H-15 lock fail-open) would both succeed at
     * updating the same `cleaner_payouts` rows to point at their own freshly-inserted run,
     * with the last writer silently winning. The IS NULL filter means only the first
     * runner's update lands; the loser sees `linked.length === 0` and deletes its empty
     * run row below, leaving a single canonical run.
     */
    .is("payout_run_id", null)
    .select("id");

  if (upErr) {
    await admin.from("cleaner_payout_runs").delete().eq("id", runRow.id);
    throw new Error(upErr.message);
  }

  const linkedCount = linked?.length ?? 0;
  if (linkedCount === 0) {
    /**
     * Race loss: a concurrent createPayoutRun already linked the candidate payouts to
     * its own run. Roll back the just-inserted empty run so we don't accumulate orphan
     * `cleaner_payout_runs` draft rows. This is idempotent — if the delete also fails
     * we still surface the metric and return null so the caller treats it as no-op.
     */
    await admin.from("cleaner_payout_runs").delete().eq("id", runRow.id);
    metrics.increment("cleaner.create_payout_run_race_lost", {
      runId: runRow.id,
      candidatePayoutCount: ids.length,
      source: "createPayoutRun",
    });
    void logSystemEvent({
      level: "info",
      source: "create_payout_run_race_lost",
      message: "M-18 race guard rolled back empty draft cleaner_payout_runs (concurrent runner won)",
      context: { rolledBackRunId: runRow.id, candidatePayoutCount: ids.length },
    });
    return null;
  }

  void logSystemEvent({
    level: "info",
    source: "payout_run_created",
    message: "Created draft cleaner_payout_runs batch",
    context: { runId: runRow.id, payoutCount: linkedCount, total_amount_cents: total },
  });

  return runRow;
}
