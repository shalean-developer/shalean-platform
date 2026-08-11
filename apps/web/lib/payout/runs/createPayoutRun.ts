import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { metrics } from "@/lib/metrics/counters";
import { isClosedMonthlyPayoutBatchPeriod } from "@/lib/payout/monthBounds";

export type CleanerPayoutRunRow = {
  id: string;
  status: string;
  total_amount_cents: number;
  created_at: string;
  approved_at: string | null;
  paid_at: string | null;
};

/**
 * Groups all frozen, fully closed monthly payouts that are not yet on a run into
 * a new draft `cleaner_payout_runs` row. Current-month accruals are never
 * disbursement candidates.
 *
 * M-18 race-loss handling: the post-insert update is guarded by `payout_run_id IS NULL` so that
 * if a concurrent `createPayoutRun` runner already linked the same frozen `cleaner_payouts` rows
 * to a different run, this caller's update affects 0 rows and we delete the just-inserted empty
 * `cleaner_payout_runs` row instead of silently overwriting the winner's link.
 */
export async function createPayoutRun(admin: SupabaseClient, now: Date = new Date()): Promise<CleanerPayoutRunRow | null> {
  const { data: payouts, error: selErr } = await admin
    .from("cleaner_payouts")
    .select("id, total_amount_cents, period_start, period_end")
    .eq("status", "frozen")
    .is("payout_run_id", null);

  if (selErr) throw new Error(selErr.message);
  const list = (payouts ?? []).filter((p) => {
    const row = p as { period_start?: string; period_end?: string };
    return isClosedMonthlyPayoutBatchPeriod(String(row.period_start ?? ""), String(row.period_end ?? ""), now);
  });
  if (!list.length) return null;

  const total = list.reduce(
    (s, p) => s + Math.max(0, Math.floor(Number((p as { total_amount_cents?: number }).total_amount_cents) || 0)),
    0,
  );

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
    .is("payout_run_id", null)
    .select("id");

  if (upErr) {
    await admin.from("cleaner_payout_runs").delete().eq("id", runRow.id);
    throw new Error(upErr.message);
  }

  const linkedCount = linked?.length ?? 0;
  if (linkedCount === 0) {
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
    message: "Created draft cleaner_payout_runs batch for closed monthly payouts",
    context: { runId: runRow.id, payoutCount: linkedCount, total_amount_cents: total },
  });

  return runRow;
}
