import type { SupabaseClient } from "@supabase/supabase-js";
import { assignmentTruthPatchForOfferStart } from "@/lib/dispatch/assignmentTruth";
import { BOOKING_PAYOUT_COLUMNS_CLEAR } from "@/lib/payout/bookingPayoutColumns";

export type SetAdminManualBookingOfferedParams = {
  admin: SupabaseClient;
  bookingId: string;
  dispatchWasUnassignable: boolean;
  nowIsoForPending: string;
};

export type SetAdminManualBookingOfferedResult =
  | { ok: true }
  | { ok: false; error: string; code?: "team_assignment_conflict" };

/**
 * Command boundary for admin manual individual-cleaner offer state.
 *
 * The no-team predicates are deliberately part of the UPDATE itself, not only a prior read.
 * This closes the race where `assign_team_and_sync_roster` could attach a team after validation
 * but before the solo-offer transition. In that case zero rows are updated and the caller gets
 * a conflict instead of split assignment truth.
 */
export async function setAdminManualBookingOffered(
  params: SetAdminManualBookingOfferedParams,
): Promise<SetAdminManualBookingOfferedResult> {
  const { data, error } = await params.admin
    .from("bookings")
    .update({
      ...assignmentTruthPatchForOfferStart(),
      ...BOOKING_PAYOUT_COLUMNS_CLEAR,
      ...(params.dispatchWasUnassignable ? { became_pending_at: params.nowIsoForPending } : {}),
    })
    .eq("id", params.bookingId)
    .is("team_id", null)
    .or("is_team_job.is.null,is_team_job.eq.false")
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return {
      ok: false,
      code: "team_assignment_conflict",
      error: "Booking gained a team assignment before the individual offer could be created.",
    };
  }
  return { ok: true };
}
