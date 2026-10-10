import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPayoutRows } from "@/lib/payout/payoutQueryPagination";

/**
 * Recompute a DRAFT payout-run total in place after a frozen child payout gains
 * late earnings. Approved/paid runs are intentionally immutable.
 *
 * MASTER-03A deliberately does not detach/reopen frozen payouts from their run.
 * Late earnings are appended directly to a frozen payout only while its parent
 * run is still draft, then both payout and run totals are reconciled in place.
 */
export async function refreshDraftPayoutRunTotal(
  admin: SupabaseClient,
  runId: string,
): Promise<{ ok: true; totalAmountCents: number } | { ok: false; error: string }> {
  const id = String(runId ?? "").trim();
  if (!id) return { ok: false, error: "Missing payout run id." };

  let payouts: Array<{ total_amount_cents?: number | null }> = [];
  try {
    payouts = await fetchAllPayoutRows((from, to) =>
      admin
        .from("cleaner_payouts")
        .select("id, total_amount_cents")
        .eq("payout_run_id", id)
        .neq("status", "cancelled")
        .order("id", { ascending: true })
        .range(from, to),
    );
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const totalAmountCents = payouts.reduce(
    (sum, row) => sum + Math.max(0, Math.floor(Number(row.total_amount_cents) || 0)),
    0,
  );

  const { data, error } = await admin
    .from("cleaner_payout_runs")
    .update({ total_amount_cents: totalAmountCents })
    .eq("id", id)
    .eq("status", "draft")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Payout run is no longer draft." };

  return { ok: true, totalAmountCents };
}
