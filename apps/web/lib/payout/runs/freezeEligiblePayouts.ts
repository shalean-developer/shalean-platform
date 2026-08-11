import type { SupabaseClient } from "@supabase/supabase-js";
import { isClosedMonthlyPayoutBatchPeriod } from "@/lib/payout/monthBounds";
import { logSystemEvent } from "@/lib/logging/systemLog";

export type FreezeEligiblePayoutsResult = { frozenCount: number };

/**
 * Locks monthly `cleaner_payouts` rows that are still `pending` so amounts are safe to batch.
 *
 * Only fully closed Johannesburg calendar months may be frozen. Current-month
 * earnings are still accruing and must remain editable/unbatched until month
 * close. Does not touch rows already assigned to a disbursement run or legacy
 * weekly periods.
 */
export async function freezeEligiblePayouts(
  admin: SupabaseClient,
  now: Date = new Date(),
): Promise<FreezeEligiblePayoutsResult> {
  const { data: pending, error: selErr } = await admin
    .from("cleaner_payouts")
    .select("id, period_start, period_end")
    .eq("status", "pending")
    .is("payout_run_id", null);

  if (selErr) throw new Error(selErr.message);

  const ids = (pending ?? [])
    .filter((row) =>
      isClosedMonthlyPayoutBatchPeriod(
        String((row as { period_start?: string }).period_start ?? ""),
        String((row as { period_end?: string }).period_end ?? ""),
        now,
      ),
    )
    .map((row) => String((row as { id?: string }).id ?? ""))
    .filter(Boolean);

  if (!ids.length) return { frozenCount: 0 };

  const frozenAt = now.toISOString();
  const { data, error } = await admin
    .from("cleaner_payouts")
    .update({ status: "frozen", frozen_at: frozenAt })
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
      message: "Frozen eligible closed-month cleaner payout rows for disbursement batching",
      context: { frozenCount },
    });
  }
  return { frozenCount };
}
