import type { SupabaseClient } from "@supabase/supabase-js";
import { johannesburgCalendarYmd } from "@/lib/dashboard/johannesburgMonth";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getJohannesburgMonthBoundsContainingYmd } from "@/lib/payout/monthBounds";

/**
 * Approves a DRAFT cleaner payout run only after the database transaction locks
 * the run and all child payouts, verifies closed-month periods, reconciled totals,
 * and collected-cash funding, then updates every child and the run atomically.
 */
export async function approvePayoutRun(
  admin: SupabaseClient,
  runId: string,
  approvedBy?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const currentMonthStart = getJohannesburgMonthBoundsContainingYmd(
    johannesburgCalendarYmd(new Date()),
  ).periodStart;

  const { data, error } = await admin.rpc("approve_cleaner_payout_run_atomic", {
    p_run_id: runId,
    p_current_month_start: currentMonthStart,
    p_approved_by: approvedBy?.trim() || null,
  });

  if (error) return { ok: false, error: error.message };

  const childPayoutCount = Math.max(0, Math.floor(Number(data) || 0));
  if (childPayoutCount <= 0) {
    return { ok: false, error: "Payout run has no cleaner payouts." };
  }

  void logSystemEvent({
    level: "info",
    source: "payout_run_approved",
    message: "Approved fully funded closed-month cleaner payout run",
    context: {
      runId,
      childPayoutCount,
      approvedBy: approvedBy ?? null,
      fundingGapCents: 0,
    },
  });

  return { ok: true };
}
