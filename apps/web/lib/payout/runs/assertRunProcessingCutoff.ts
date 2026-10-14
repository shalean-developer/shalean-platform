import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPayoutRows } from "@/lib/payout/payoutQueryPagination";
import { loadCleanerPayoutBatchItems } from "@/lib/payout/loadCleanerPayoutBatchItems";
import { isPayoutVisitInPeriod, isProcessableClosedPayoutPeriod } from "@/lib/payout/payoutProcessingCutoff";

/** Validate the entire run before any child transfer or run-state mutation. */
export async function assertRunProcessingCutoff(admin: SupabaseClient, runId: string): Promise<void> {
  const payouts = await fetchAllPayoutRows((from, to) => admin.from("cleaner_payouts")
    .select("id, period_start, period_end")
    .eq("payout_run_id", runId).order("id", { ascending: true }).range(from, to));
  if (!payouts.length) throw new Error("Payout run has no earning batches.");
  for (const raw of payouts) {
    const payout = raw as { id: string; period_start: string; period_end: string };
    if (!isProcessableClosedPayoutPeriod(payout.period_start, payout.period_end)) {
      throw new Error("Run processing requires closed October-or-later monthly payouts.");
    }
    const loaded = await loadCleanerPayoutBatchItems(admin, payout.id);
    if (loaded.error) throw new Error(loaded.error);
    if (!loaded.items.length || loaded.items.some((item) => !isPayoutVisitInPeriod(item.date, payout.period_start, payout.period_end))) {
      throw new Error("Historical or undated earning items cannot enter current payout processing.");
    }
  }
}
