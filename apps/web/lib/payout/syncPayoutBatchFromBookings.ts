import type { SupabaseClient } from "@supabase/supabase-js";

const EDITABLE_BATCH_STATUSES = new Set(["pending", "frozen"]);

function bookingLineTotalCents(row: {
  cleaner_payout_cents?: number | null;
  cleaner_bonus_cents?: number | null;
}): number {
  return (
    Math.max(0, Math.floor(Number(row.cleaner_payout_cents) || 0)) +
    Math.max(0, Math.floor(Number(row.cleaner_bonus_cents) || 0))
  );
}

function ymdInInclusiveRange(ymd: string, from: string, to: string): boolean {
  return ymd >= from && ymd <= to;
}

/**
 * Re-sum linked bookings + roster member lines + batched team-member lines for a payout batch.
 * Clears batch-level manual override.
 *
 * Team member rows have no `cleaner_payout_id` (schema); they are attributed by
 * `cleaner_id` + `status = batched` + booking date inside the batch period.
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

  const { data: bookings, error: bookingsErr } = await admin
    .from("bookings")
    .select("cleaner_payout_cents, cleaner_bonus_cents")
    .eq("payout_id", payoutId);
  if (bookingsErr) return { ok: false, error: bookingsErr.message };

  const bookingTotal = (bookings ?? []).reduce((sum, row) => sum + bookingLineTotalCents(row), 0);

  const { data: memberRows, error: memberErr } = await admin
    .from("booking_roster_member_payouts")
    .select("payout_cents, bonus_cents")
    .eq("cleaner_payout_id", payoutId);
  if (memberErr) return { ok: false, error: memberErr.message };

  const rosterTotal = (memberRows ?? []).reduce(
    (sum, row) =>
      sum +
      Math.max(0, Math.floor(Number((row as { payout_cents?: number }).payout_cents) || 0)) +
      Math.max(0, Math.floor(Number((row as { bonus_cents?: number }).bonus_cents) || 0)),
    0,
  );

  let teamMemberTotal = 0;
  const cleanerId = String((payout as { cleaner_id?: string | null }).cleaner_id ?? "").trim();
  const periodStart = String((payout as { period_start?: string | null }).period_start ?? "").trim();
  const periodEnd = String((payout as { period_end?: string | null }).period_end ?? "").trim();
  if (cleanerId && /^\d{4}-\d{2}-\d{2}$/.test(periodStart) && /^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
    const { data: tjRows, error: tjErr } = await admin
      .from("team_job_member_payouts")
      .select("booking_id, payout_cents, status")
      .eq("cleaner_id", cleanerId)
      .eq("status", "batched");
    if (tjErr) return { ok: false, error: tjErr.message };

    const bookingIds = [
      ...new Set(
        (tjRows ?? [])
          .map((row) => String((row as { booking_id?: string }).booking_id ?? "").trim())
          .filter(Boolean),
      ),
    ];
    const dateByBooking = new Map<string, string>();
    if (bookingIds.length > 0) {
      for (let i = 0; i < bookingIds.length; i += 120) {
        const slice = bookingIds.slice(i, i + 120);
        const { data: dateRows, error: dateErr } = await admin
          .from("bookings")
          .select("id, date")
          .in("id", slice)
          .eq("status", "completed")
          .eq("is_test", false);
        if (dateErr) return { ok: false, error: dateErr.message };
        for (const raw of dateRows ?? []) {
          const row = raw as { id?: string; date?: string | null };
          const id = String(row.id ?? "").trim();
          const date = String(row.date ?? "").trim();
          if (id && date) dateByBooking.set(id, date);
        }
      }
    }

    for (const raw of tjRows ?? []) {
      const row = raw as { booking_id?: string; payout_cents?: number | null };
      const bookingId = String(row.booking_id ?? "").trim();
      const date = dateByBooking.get(bookingId);
      if (!date || !ymdInInclusiveRange(date, periodStart, periodEnd)) continue;
      teamMemberTotal += Math.max(0, Math.floor(Number(row.payout_cents) || 0));
    }
  }

  const totalCents = bookingTotal + rosterTotal + teamMemberTotal;

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
  },
): Promise<{ ok: true; batchTotalCents: number | null; syncedPayoutIds: string[] } | { ok: false; error: string }> {
  const ids = new Set<string>();
  const bookingPayoutId = String(params.bookingPayoutId ?? "").trim();
  if (bookingPayoutId) ids.add(bookingPayoutId);
  const rosterPayoutId = String(params.rosterCleanerPayoutId ?? "").trim();
  if (rosterPayoutId) ids.add(rosterPayoutId);

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
