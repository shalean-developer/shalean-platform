import type { SupabaseClient } from "@supabase/supabase-js";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { notifyBookingEvent } from "@/lib/notifications/notifyBookingEvent";

/**
 * Runs the central assigned-booking notification flow (customer in-app + email, admin email, cleaner WhatsApp + SMS fallback, optional cleaner email via env).
 */
export async function notifyCleanerAssignedBooking(
  supabase: SupabaseClient,
  bookingId: string,
  cleanerId: string,
): Promise<void> {
  try {
    await notifyBookingEvent({ type: "assigned", supabase, bookingId, cleanerId });
  } catch (e) {
    await reportOperationalIssue("error", "notifyCleanerAssignedBooking", String(e), { bookingId, cleanerId });
  }
}
