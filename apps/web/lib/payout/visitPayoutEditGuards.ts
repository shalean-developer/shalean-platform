import type { SupabaseClient } from "@supabase/supabase-js";

const EDITABLE_BATCH_STATUSES = new Set(["pending", "frozen"]);

type BookingPayoutRow = {
  payout_id: string | null;
  payout_status: string | null;
  payout_paid_at?: string | null;
};

export async function assertBookingVisitPayoutEditable(
  admin: SupabaseClient,
  row: BookingPayoutRow,
): Promise<{ ok: true; payoutId: string | null } | { ok: false; error: string; code: string }> {
  const payoutStatus = String(row.payout_status ?? "").trim().toLowerCase();
  if (payoutStatus === "paid" || row.payout_paid_at) {
    return { ok: false, error: "Booking payout is already paid.", code: "booking_payout_paid" };
  }

  const payoutId = String(row.payout_id ?? "").trim() || null;
  if (!payoutId) return { ok: true, payoutId: null };

  const { data: batch, error: batchErr } = await admin
    .from("cleaner_payouts")
    .select("status, payout_run_id")
    .eq("id", payoutId)
    .maybeSingle();
  if (batchErr) return { ok: false, error: batchErr.message, code: "payout_lookup_failed" };
  if (!batch) return { ok: false, error: "Linked payout batch not found.", code: "payout_not_found" };

  const batchStatus = String((batch as { status?: string }).status ?? "").toLowerCase();
  const payoutRunId = String((batch as { payout_run_id?: string | null }).payout_run_id ?? "").trim();
  if (payoutRunId) {
    return {
      ok: false,
      error: "Payout is part of a disbursement run; edit the batch before freezing the run.",
      code: "payout_run_locked",
    };
  }
  if (!EDITABLE_BATCH_STATUSES.has(batchStatus)) {
    return {
      ok: false,
      error: "Payout batch is approved or paid; visit earnings cannot be edited.",
      code: "payout_batch_locked",
    };
  }

  return { ok: true, payoutId };
}
