import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminBookingEarningsResetSafetyResult =
  | { ok: true }
  | { ok: false; status: number; error: string; code: string };

/**
 * Guards {@link resetBookingCleanerLineEarnings} + re-persist: no locked weekly payout,
 * booking not already in invoice payout pipeline, and no non-pending `cleaner_earnings` rows.
 */
export async function assertBookingCleanerEarningsResetSafe(
  admin: SupabaseClient,
  bookingId: string,
): Promise<AdminBookingEarningsResetSafetyResult> {
  const bid = bookingId.trim();
  if (!/^[0-9a-f-]{36}$/i.test(bid)) {
    return { ok: false, status: 400, error: "Invalid booking id.", code: "invalid_booking_id" };
  }

  const { data: b, error: bErr } = await admin
    .from("bookings")
    .select("id, payout_id, payout_status, payout_paid_at")
    .eq("id", bid)
    .maybeSingle();
  if (bErr || !b) {
    return { ok: false, status: 404, error: bErr?.message ?? "Booking not found.", code: "booking_not_found" };
  }

  const payoutStatus = String((b as { payout_status?: string | null }).payout_status ?? "")
    .trim()
    .toLowerCase();
  const payoutPaidAt = (b as { payout_paid_at?: string | null }).payout_paid_at;
  if (payoutPaidAt != null && String(payoutPaidAt).trim() !== "") {
    return {
      ok: false,
      status: 409,
      error: "Booking payout is already marked paid; reset is not allowed.",
      code: "booking_payout_paid_at_set",
    };
  }
  if (payoutStatus === "eligible" || payoutStatus === "paid") {
    return {
      ok: false,
      status: 409,
      error: "Booking payout is already eligible or paid; reset is not allowed.",
      code: "booking_payout_status_blocked",
    };
  }

  const payoutId = String((b as { payout_id?: string | null }).payout_id ?? "").trim();
  if (payoutId) {
    const { data: cp, error: cpErr } = await admin
      .from("cleaner_payouts")
      .select("status, frozen_at")
      .eq("id", payoutId)
      .maybeSingle();
    if (cpErr) {
      return { ok: false, status: 500, error: cpErr.message, code: "payout_lookup_failed" };
    }
    if (cp) {
      const row = cp as { status?: string | null; frozen_at?: string | null };
      const st = String(row.status ?? "")
        .trim()
        .toLowerCase();
      const frozenAt = row.frozen_at != null && String(row.frozen_at).trim() !== "";
      if (frozenAt || st === "frozen" || st === "approved" || st === "paid") {
        return {
          ok: false,
          status: 409,
          error: "Weekly payout batch is frozen, approved, or paid; reset is not allowed.",
          code: "weekly_payout_locked",
        };
      }
    }
  }

  const { data: ceRows, error: ceErr } = await admin.from("cleaner_earnings").select("id, status").eq("booking_id", bid);
  if (ceErr) {
    return { ok: false, status: 500, error: ceErr.message, code: "cleaner_earnings_lookup_failed" };
  }
  for (const raw of ceRows ?? []) {
    const st = String((raw as { status?: string | null }).status ?? "")
      .trim()
      .toLowerCase();
    if (st && st !== "pending") {
      return {
        ok: false,
        status: 409,
        error: `cleaner_earnings row exists with status "${st}"; only pending or empty is allowed.`,
        code: "cleaner_earnings_non_pending",
      };
    }
  }

  return { ok: true };
}
