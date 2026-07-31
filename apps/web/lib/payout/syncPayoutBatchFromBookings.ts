import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCleanerPayoutBatchItems } from "@/lib/payout/loadCleanerPayoutBatchItems";

const EDITABLE_BATCH_STATUSES = new Set(["pending", "frozen"]);

function ymdInInclusiveRange(ymd: string, from: string, to: string): boolean {
  return ymd >= from && ymd <= to;
}

/**
 * Re-sum linked bookings + roster member lines + team-member lines for a payout batch.
 * Clears batch-level manual override.
 *
 * Every rail is linked by the exact `cleaner_payout_id`.
 */
export async function syncPayoutBatchFromBookings(
  admin: SupabaseClient,
  payoutId: string,
): Promise<{ ok: true; totalCents: number } | { ok: false; error: string }> {
  const { data: payout, error: payoutErr } = await admin
    .from("cleaner_payouts")
    .select("id, status, cleaner_id, period_start, period_end")
    .eq("id", payoutId)
    .maybeSingle();
  if (payoutErr) return { ok: false, error: payoutErr.message };
  if (!payout) return { ok: false, error: "Payout batch not found." };

  const status = String((payout as { status?: string }).status ?? "").toLowerCase();
  if (!EDITABLE_BATCH_STATUSES.has(status)) {
    return { ok: false, error: "Payout batch is no longer editable." };
  }

  const loaded = await loadCleanerPayoutBatchItems(admin, payoutId);
  if (loaded.error) return { ok: false, error: loaded.error };
  const totalCents = loaded.totalCents;

  const { data: updated, error: upErr } = await admin
    .from("cleaner_payouts")
    .update({
      total_amount_cents: totalCents,
      calculated_amount_cents: totalCents,
      adjustment_note: null,
      amount_adjusted_at: null,
      amount_adjusted_by: null,
    })
    .eq("id", payoutId)
    .in("status", ["pending", "frozen"])
    .select("id");
  if (upErr) return { ok: false, error: upErr.message };
  if (!updated?.length) return { ok: false, error: "Payout batch could not be synced." };

  return { ok: true, totalCents };
}

/**
 * Sync every open batch that may include this visit for the edited cleaner.
 */
export async function syncOpenPayoutBatchesForVisitEdit(
  admin: SupabaseClient,
  params: {
    cleanerId: string;
    bookingPayoutId: string | null;
    bookingDate: string | null;
    rosterCleanerPayoutId?: string | null;
    teamCleanerPayoutId?: string | null;
  },
): Promise<{ ok: true; batchTotalCents: number | null; syncedPayoutIds: string[] } | { ok: false; error: string }> {
  const ids = new Set<string>();
  const bookingPayoutId = String(params.bookingPayoutId ?? "").trim();
  if (bookingPayoutId) ids.add(bookingPayoutId);
  const rosterPayoutId = String(params.rosterCleanerPayoutId ?? "").trim();
  if (rosterPayoutId) ids.add(rosterPayoutId);
  const teamPayoutId = String(params.teamCleanerPayoutId ?? "").trim();
  if (teamPayoutId) ids.add(teamPayoutId);

  const cleanerId = String(params.cleanerId ?? "").trim();
  const bookingDate = String(params.bookingDate ?? "").trim();
  if (cleanerId && /^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
    const { data: openBatches, error } = await admin
      .from("cleaner_payouts")
      .select("id, period_start, period_end, status")
      .eq("cleaner_id", cleanerId)
      .in("status", ["pending", "frozen"]);
    if (error) return { ok: false, error: error.message };
    for (const raw of openBatches ?? []) {
      const row = raw as { id?: string; period_start?: string | null; period_end?: string | null };
      const id = String(row.id ?? "").trim();
      const from = String(row.period_start ?? "").trim();
      const to = String(row.period_end ?? "").trim();
      if (!id || !from || !to) continue;
      if (ymdInInclusiveRange(bookingDate, from, to)) ids.add(id);
    }
  }

  let lastTotal: number | null = null;
  const synced: string[] = [];
  for (const payoutId of ids) {
    const syncedBatch = await syncPayoutBatchFromBookings(admin, payoutId);
    if (!syncedBatch.ok) return syncedBatch;
    lastTotal = syncedBatch.totalCents;
    synced.push(payoutId);
  }
  return { ok: true, batchTotalCents: lastTotal, syncedPayoutIds: synced };
}
