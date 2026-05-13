import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKING_PAYOUT_COLUMNS_CLEAR } from "@/lib/payout/bookingPayoutColumns";

export type SetAdminManualBookingOfferedParams = {
  admin: SupabaseClient;
  bookingId: string;
  dispatchWasUnassignable: boolean;
  nowIsoForPending: string;
};

/**
 * Command boundary for admin manual cleaner-offer state.
 * Phase 1D preserves the existing booking update shape and conditions.
 */
export async function setAdminManualBookingOffered(
  params: SetAdminManualBookingOfferedParams,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await params.admin
    .from("bookings")
    .update({
      cleaner_id: null,
      status: "offered",
      dispatch_status: "offered",
      assigned_at: null,
      accepted_at: null,
      ...BOOKING_PAYOUT_COLUMNS_CLEAR,
      ...(params.dispatchWasUnassignable ? { became_pending_at: params.nowIsoForPending } : {}),
    })
    .eq("id", params.bookingId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
