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

/** Re-sum linked bookings and align batch totals (clears batch-level manual override). */
export async function syncPayoutBatchFromBookings(
  admin: SupabaseClient,
  payoutId: string,
): Promise<{ ok: true; totalCents: number } | { ok: false; error: string }> {
  const { data: payout, error: payoutErr } = await admin
    .from("cleaner_payouts")
    .select("id, status")
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

  const totalCents = bookingTotal + rosterTotal;

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
