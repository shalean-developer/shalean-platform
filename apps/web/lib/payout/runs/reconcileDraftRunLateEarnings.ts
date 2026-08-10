import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

type PreparedPayout = {
  payoutId: string;
  runId: string;
};

export type DraftRunCatchUpPreparation = {
  payouts: PreparedPayout[];
  runIds: string[];
};

/**
 * Temporarily re-opens frozen cleaner payouts that belong to a DRAFT payout run.
 *
 * This lets the normal monthly payout generator append late eligible earnings to
 * the canonical cleaner/period payout without creating a duplicate payout row.
 * Approved/paid runs are deliberately excluded.
 *
 * Call restoreDraftRunPayoutsAfterCatchUp in a finally block.
 */
export async function prepareDraftRunPayoutsForCatchUp(
  admin: SupabaseClient,
): Promise<DraftRunCatchUpPreparation> {
  const { data: frozen, error: frozenErr } = await admin
    .from("cleaner_payouts")
    .select("id, payout_run_id")
    .eq("status", "frozen")
    .not("payout_run_id", "is", null);

  if (frozenErr) throw new Error(frozenErr.message);

  const candidateRows = (frozen ?? [])
    .map((row) => ({
      payoutId: String((row as { id?: string }).id ?? ""),
      runId: String((row as { payout_run_id?: string | null }).payout_run_id ?? ""),
    }))
    .filter((row) => row.payoutId && row.runId);

  const runIds = [...new Set(candidateRows.map((row) => row.runId))];
  if (!runIds.length) return { payouts: [], runIds: [] };

  const { data: runs, error: runErr } = await admin
    .from("cleaner_payout_runs")
    .select("id, status")
    .in("id", runIds);
  if (runErr) throw new Error(runErr.message);

  const draftRunIds = new Set(
    (runs ?? [])
      .filter((row) => String((row as { status?: string }).status ?? "").toLowerCase() === "draft")
      .map((row) => String((row as { id?: string }).id ?? ""))
      .filter(Boolean),
  );

  const eligible = candidateRows.filter((row) => draftRunIds.has(row.runId));
  if (!eligible.length) return { payouts: [], runIds: [] };

  const now = new Date().toISOString();
  const reopened: PreparedPayout[] = [];
  for (const row of eligible) {
    const { data, error } = await admin
      .from("cleaner_payouts")
      .update({ status: "pending", payout_run_id: null, frozen_at: null })
      .eq("id", row.payoutId)
      .eq("status", "frozen")
      .eq("payout_run_id", row.runId)
      .select("id")
      .maybeSingle();

    if (error) {
      await reportOperationalIssue("error", "payout_late_earnings_reconcile", error.message, {
        payoutId: row.payoutId,
        runId: row.runId,
      });
      continue;
    }
    if (data) reopened.push(row);
  }

  if (reopened.length) {
    await logSystemEvent({
      level: "info",
      source: "payout_late_earnings_reconcile",
      message: "Temporarily reopened frozen payouts in draft runs for late-earnings catch-up",
      context: {
        at: now,
        payout_count: reopened.length,
        run_ids: [...new Set(reopened.map((row) => row.runId))],
      },
    });
  }

  return {
    payouts: reopened,
    runIds: [...new Set(reopened.map((row) => row.runId))],
  };
}

/** Restores catch-up payouts to their original draft run and refreshes run totals. */
export async function restoreDraftRunPayoutsAfterCatchUp(
  admin: SupabaseClient,
  prep: DraftRunCatchUpPreparation,
): Promise<void> {
  if (!prep.payouts.length) return;
  const now = new Date().toISOString();

  for (const row of prep.payouts) {
    const { error } = await admin
      .from("cleaner_payouts")
      .update({ status: "frozen", frozen_at: now, payout_run_id: row.runId })
      .eq("id", row.payoutId)
      .eq("status", "pending")
      .is("payout_run_id", null);
    if (error) {
      await reportOperationalIssue("error", "payout_late_earnings_reconcile", error.message, {
        payoutId: row.payoutId,
        runId: row.runId,
        phase: "restore",
      });
    }
  }

  for (const runId of prep.runIds) {
    const { data: payouts, error: payoutsErr } = await admin
      .from("cleaner_payouts")
      .select("total_amount_cents")
      .eq("payout_run_id", runId)
      .neq("status", "cancelled");
    if (payoutsErr) {
      await reportOperationalIssue("error", "payout_late_earnings_reconcile", payoutsErr.message, {
        runId,
        phase: "recompute_run_total",
      });
      continue;
    }

    const totalAmountCents = (payouts ?? []).reduce(
      (sum, row) => sum + Math.max(0, Math.floor(Number((row as { total_amount_cents?: number }).total_amount_cents) || 0)),
      0,
    );

    const { error: runUpdateErr } = await admin
      .from("cleaner_payout_runs")
      .update({ total_amount_cents: totalAmountCents })
      .eq("id", runId)
      .eq("status", "draft");
    if (runUpdateErr) {
      await reportOperationalIssue("error", "payout_late_earnings_reconcile", runUpdateErr.message, {
        runId,
        phase: "update_run_total",
      });
    }
  }

  await logSystemEvent({
    level: "info",
    source: "payout_late_earnings_reconcile",
    message: "Restored reconciled payouts to draft runs and refreshed run totals",
    context: {
      payout_count: prep.payouts.length,
      run_ids: prep.runIds,
    },
  });
}
