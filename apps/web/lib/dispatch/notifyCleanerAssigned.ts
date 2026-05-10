import type { SupabaseClient } from "@supabase/supabase-js";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { notifyBookingEvent } from "@/lib/notifications/notifyBookingEvent";
import { bookingRequiresPersistedEarningsBeforeCleanerNotify } from "@/lib/payout/adminBookingAssignmentEarningsGate";
import { hasPersistedDisplayEarningsBasis } from "@/lib/payout/bookingEarningsIntegrity";
import { persistCleanerPayoutIfUnset } from "@/lib/payout/persistCleanerPayout";

/**
 * Runs the central assigned-booking notification flow (customer in-app + email, admin email, cleaner WhatsApp + SMS fallback, optional cleaner email via env).
 */
export async function notifyCleanerAssignedBooking(
  supabase: SupabaseClient,
  bookingId: string,
  cleanerId: string,
): Promise<void> {
  let payoutOk = false;
  try {
    const payout = await persistCleanerPayoutIfUnset({ admin: supabase, bookingId, cleanerId });
    payoutOk = payout.ok;
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

  const { data: gateRow, error: gateErr } = await supabase
    .from("bookings")
    .select(
      "display_earnings_cents, is_team_job, billing_type, is_monthly_billing_booking, monthly_invoice_id, status, total_paid_zar, total_paid_cents, amount_paid_cents, payment_status, paid_at, refunded_at, refund_status",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!gateErr && gateRow && bookingRequiresPersistedEarningsBeforeCleanerNotify(gateRow as never)) {
    const display = (gateRow as { display_earnings_cents?: unknown }).display_earnings_cents;
    if (!payoutOk || !hasPersistedDisplayEarningsBasis(display)) {
      await reportOperationalIssue("warn", "notifyCleanerAssignedBooking", "skip_assigned_notify_missing_earnings_basis", {
        bookingId,
        cleanerId,
        payout_ok: payoutOk,
      });
      return;
    }
  }

  try {
    await notifyBookingEvent({ type: "assigned", supabase, bookingId, cleanerId });
  } catch (e) {
    await reportOperationalIssue("error", "notifyCleanerAssignedBooking", String(e), { bookingId, cleanerId });
  }
}
