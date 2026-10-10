import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getPreviousMonthDateBoundsJhb } from "@/lib/payout/monthBounds";

export type CleanerPayoutRunRow = {
  id: string;
  status: string;
  total_amount_cents: number;
  created_at: string;
  approved_at: string | null;
  paid_at: string | null;
};

/**
 * Groups every eligible frozen, fully closed Johannesburg monthly payout into
 * one DRAFT payout run. Candidate locking, total calculation, run creation and
 * payout attachment happen inside one PostgreSQL transaction.
 */
export async function createPayoutRun(
  admin: SupabaseClient,
  now: Date = new Date(),
): Promise<CleanerPayoutRunRow | null> {
  const { periodEnd } = getPreviousMonthDateBoundsJhb(now);
  const { data, error } = await admin.rpc("create_cleaner_payout_run_atomic", {
    p_closed_through: periodEnd,
  });
  if (error) throw new Error(error.message);
  if (!data) return null;

  const raw = data as Record<string, unknown>;
  const runRow: CleanerPayoutRunRow = {
    id: String(raw.id ?? ""),
    status: String(raw.status ?? "draft"),
    total_amount_cents: Math.max(0, Math.floor(Number(raw.total_amount_cents) || 0)),
    created_at: String(raw.created_at ?? ""),
    approved_at: raw.approved_at == null ? null : String(raw.approved_at),
    paid_at: raw.paid_at == null ? null : String(raw.paid_at),
  };

  if (!runRow.id) throw new Error("Atomic payout-run creation returned no id.");

  void logSystemEvent({
    level: "info",
    source: "payout_run_created",
    message: "Created draft cleaner_payout_runs batch for closed monthly payouts",
    context: {
      runId: runRow.id,
      payoutCount: Math.max(0, Math.floor(Number(raw.payout_count) || 0)),
      total_amount_cents: runRow.total_amount_cents,
    },
  });

  return runRow;
}
