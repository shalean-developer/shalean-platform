import type { SupabaseClient } from "@supabase/supabase-js";
import { johannesburgCalendarYmd } from "@/lib/dashboard/johannesburgMonth";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getJohannesburgMonthBoundsContainingYmd } from "@/lib/payout/monthBounds";

export type FreezeEligiblePayoutsResult = { frozenCount: number };

/**
 * Freezes every eligible fully closed Johannesburg monthly payout in one
 * database statement. This avoids API page limits and leaves no subset behind
 * before payout-run creation.
 */
export async function freezeEligiblePayouts(
  admin: SupabaseClient,
  now: Date = new Date(),
): Promise<FreezeEligiblePayoutsResult> {
  const currentMonthStart = getJohannesburgMonthBoundsContainingYmd(
    johannesburgCalendarYmd(now),
  ).periodStart;
  const frozenAt = now.toISOString();

  const { data, error } = await admin.rpc("freeze_eligible_cleaner_payouts_atomic", {
    p_current_month_start: currentMonthStart,
    p_frozen_at: frozenAt,
  });
  if (error) throw new Error(error.message);

  const frozenCount = Math.max(0, Math.floor(Number(data) || 0));
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
