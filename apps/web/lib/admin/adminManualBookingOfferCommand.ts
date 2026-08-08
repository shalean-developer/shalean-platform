import type { SupabaseClient } from "@supabase/supabase-js";
import { assignmentTruthPatchForOfferStart } from "@/lib/dispatch/assignmentTruth";
import { BOOKING_PAYOUT_COLUMNS_CLEAR } from "@/lib/payout/bookingPayoutColumns";

export type SetAdminManualBookingOfferedParams = {
  admin: SupabaseClient;
  bookingId: string;
  dispatchWasUnassignable: boolean;
  nowIsoForPending: string;
};

/** Command boundary for admin manual individual-cleaner offer state. */
export async function setAdminManualBookingOffered(
  params: SetAdminManualBookingOfferedParams,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await params.admin
    .from("bookings")
    .update({
      ...assignmentTruthPatchForOfferStart(),
      ...BOOKING_PAYOUT_COLUMNS_CLEAR,
      ...(params.dispatchWasUnassignable ? { became_pending_at: params.nowIsoForPending } : {}),
    })
    .eq("id", params.bookingId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
