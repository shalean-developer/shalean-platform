import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";

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

  const { error: upErr } = await admin.from("cleaner_payouts").update({ payout_run_id: runRow.id }).in("id", ids);

  if (upErr) {
    await admin.from("cleaner_payout_runs").delete().eq("id", runRow.id);
    throw new Error(upErr.message);
  }

  void logSystemEvent({
    level: "info",
    source: "payout_run_created",
    message: "Created draft cleaner_payout_runs batch",
    context: { runId: runRow.id, payoutCount: ids.length, total_amount_cents: total },
  });

  return runRow;
}
