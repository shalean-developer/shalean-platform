import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";

/**
 * Approves a draft disbursement run and moves child `cleaner_payouts` from `frozen` → `approved`
 * so existing Paystack / mark-paid flows can execute.
 */
export async function approvePayoutRun(
  admin: SupabaseClient,
  runId: string,
  approvedBy?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: run, error: runErr } = await admin
    .from("cleaner_payout_runs")
    .select("id, status")
    .eq("id", runId)
    .maybeSingle();

  if (runErr) return { ok: false, error: runErr.message };
  if (!run || (run as { status?: string }).status !== "draft") {
    return { ok: false, error: "Run not found or not in draft status." };
  }

  const now = new Date().toISOString();

  const patch: Record<string, unknown> = {
    status: "approved",
    approved_at: now,
  };
  if (approvedBy?.trim()) patch.approved_by = approvedBy.trim();

  const { data: frozenBefore, error: pErr } = await admin.from("cleaner_payouts").select("id").eq("payout_run_id", runId).eq("status", "frozen");

  if (pErr) return { ok: false, error: pErr.message };

  const { error: upPayoutsErr } = await admin.from("cleaner_payouts").update(patch).eq("payout_run_id", runId).eq("status", "frozen");

  if (upPayoutsErr) return { ok: false, error: upPayoutsErr.message };

  const { error: upRunErr } = await admin
    .from("cleaner_payout_runs")
    .update({ status: "approved", approved_at: now })
    .eq("id", runId)
    .eq("status", "draft");

  if (upRunErr) return { ok: false, error: upRunErr.message };

  void logSystemEvent({
    level: "info",
    source: "payout_run_approved",
    message: "Approved cleaner_payout_runs batch",
    context: { runId, childPayoutCount: frozenBefore?.length ?? 0, approvedBy: approvedBy ?? null },
  });

  return { ok: true };
}
