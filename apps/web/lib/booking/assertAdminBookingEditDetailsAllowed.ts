import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { assertBookingCleanerEarningsResetSafe } from "@/lib/admin/adminBookingEarningsResetSafety";

export const ADMIN_BOOKING_EDIT_PAYOUT_LOCKED_MESSAGE = "Cannot edit booking after payout is locked";

/**
 * Admin edit of rooms/extras must not run once invoice payout or line earnings are locked,
 * or when {@link assertBookingCleanerEarningsResetSafe} would block a reset (weekly batch, non-pending ledger).
 */
export async function assertAdminBookingEditDetailsAllowed(
  admin: SupabaseClient,
  bookingId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const bid = bookingId.trim();
  if (!/^[0-9a-f-]{36}$/i.test(bid)) {
    return { ok: false, status: 400, error: "Invalid booking id." };
  }

  const { data: b, error: bErr } = await admin
    .from("bookings")
    .select("id, payout_status, cleaner_line_earnings_finalized_at")
    .eq("id", bid)
    .maybeSingle();
  if (bErr || !b) {
    return { ok: false, status: 404, error: bErr?.message ?? "Booking not found." };
  }

  const row = b as { payout_status?: string | null; cleaner_line_earnings_finalized_at?: string | null };
  const ps = String(row.payout_status ?? "")
    .trim()
    .toLowerCase();
  if (ps === "paid" || ps === "eligible") {
    return { ok: false, status: 409, error: ADMIN_BOOKING_EDIT_PAYOUT_LOCKED_MESSAGE };
  }

  const fin = row.cleaner_line_earnings_finalized_at;
  if (fin != null && String(fin).trim() !== "") {
    return { ok: false, status: 409, error: ADMIN_BOOKING_EDIT_PAYOUT_LOCKED_MESSAGE };
  }

  const resetSafe = await assertBookingCleanerEarningsResetSafe(admin, bid);
  if (!resetSafe.ok) {
    return { ok: false, status: resetSafe.status, error: ADMIN_BOOKING_EDIT_PAYOUT_LOCKED_MESSAGE };
  }

  return { ok: true };
}
