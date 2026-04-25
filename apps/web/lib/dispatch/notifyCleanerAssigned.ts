import type { SupabaseClient } from "@supabase/supabase-js";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { notifyBookingEvent } from "@/lib/notifications/notifyBookingEvent";
import { persistCleanerPayoutIfUnset } from "@/lib/payout/persistCleanerPayout";

/**
 * Runs the central assigned-booking notification flow (customer in-app + email, admin email, cleaner WhatsApp + SMS fallback, optional cleaner email via env).
 */
export async function notifyCleanerAssignedBooking(
  supabase: SupabaseClient,
  bookingId: string,
  cleanerId: string,
): Promise<void> {
  try {
    const payout = await persistCleanerPayoutIfUnset({ admin: supabase, bookingId, cleanerId });
    if (!payout.ok) {
      await reportOperationalIssue("error", "notifyCleanerAssignedBooking", `payout missing: ${payout.error}`, {
        bookingId,
        cleanerId,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("notifyCleanerAssignedBooking persistCleanerPayoutIfUnset", { bookingId, cleanerId, error: msg });
    await reportOperationalIssue("error", "notifyCleanerAssignedBooking", `payout persist threw: ${msg}`, {
      bookingId,
      cleanerId,
    });
  }

  try {
    await notifyBookingEvent({ type: "assigned", supabase, bookingId, cleanerId });
  } catch (e) {
    await reportOperationalIssue("error", "notifyCleanerAssignedBooking", String(e), { bookingId, cleanerId });
  }
}
