import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";

export type FreezeEligiblePayoutsResult = { frozenCount: number };

/**
 * Locks weekly `cleaner_payouts` rows that are still `pending` so amounts are safe to batch.
 * Does not touch rows already assigned to a disbursement run.
 */
export async function freezeEligiblePayouts(admin: SupabaseClient): Promise<FreezeEligiblePayoutsResult> {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("cleaner_payouts")
    .update({ status: "frozen", frozen_at: now })
    .eq("status", "pending")
    .is("payout_run_id", null)
    .select("id");

  if (error) throw new Error(error.message);
  const frozenCount = data?.length ?? 0;
  if (frozenCount > 0) {
    void logSystemEvent({
      level: "info",
      source: "payout_run_freeze",
      message: "Frozen eligible cleaner_payouts rows for disbursement batching",
      context: { frozenCount },
    });
  }
  return { frozenCount };
}
