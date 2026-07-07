import type { SupabaseClient } from "@supabase/supabase-js";
import { isMonthlyPayoutBatchPeriod } from "@/lib/payout/monthBounds";
import { logSystemEvent } from "@/lib/logging/systemLog";

export type FreezeEligiblePayoutsResult = { frozenCount: number };

/**
 * Locks monthly `cleaner_payouts` rows that are still `pending` so amounts are safe to batch.
 * Does not touch rows already assigned to a disbursement run or legacy weekly periods.
 */
export async function freezeEligiblePayouts(admin: SupabaseClient): Promise<FreezeEligiblePayoutsResult> {
  const { data: pending, error: selErr } = await admin
    .from("cleaner_payouts")
    .select("id, period_start, period_end")
    .eq("status", "pending")
    .is("payout_run_id", null);

  if (selErr) throw new Error(selErr.message);

  const ids = (pending ?? [])
    .filter((row) =>
      isMonthlyPayoutBatchPeriod(
        String((row as { period_start?: string }).period_start ?? ""),
        String((row as { period_end?: string }).period_end ?? ""),
      ),
    )
    .map((row) => String((row as { id?: string }).id ?? ""))
    .filter(Boolean);

  if (!ids.length) return { frozenCount: 0 };

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("cleaner_payouts")
    .update({ status: "frozen", frozen_at: now })
    .in("id", ids)
    .eq("status", "pending")
    .is("payout_run_id", null)
    .select("id");

  if (error) throw new Error(error.message);
  const frozenCount = data?.length ?? 0;
  if (frozenCount > 0) {
    void logSystemEvent({
      level: "info",
      source: "payout_run_freeze",
      message: "Frozen eligible monthly cleaner_payouts rows for disbursement batching",
      context: { frozenCount },
    });
  }
  return { frozenCount };
}
