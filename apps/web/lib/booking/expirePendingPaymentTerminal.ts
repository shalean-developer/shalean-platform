import type { SupabaseClient } from "@supabase/supabase-js";
import { cancelUnsentBookingPaymentRecoveryJobs } from "@/lib/booking/cancelUnsentBookingPaymentRecoveryJobs";
import { releaseCleaningCreditForBooking } from "@/lib/referrals/creditReservations";

export type TerminalPaymentExpirationResult =
  | { ok: true; transitioned: boolean; creditReleased: boolean }
  | { ok: false; error: string };

export async function expirePendingPaymentTerminal(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    reason: string;
    paymentNeedsFollowUp?: boolean;
    clearLinkExpiry?: boolean;
    extraPatch?: Record<string, unknown>;
  },
): Promise<TerminalPaymentExpirationResult> {
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("bookings")
    .update({
      status: "payment_expired",
      dispatch_status: "unassigned",
      payment_needs_follow_up: params.paymentNeedsFollowUp === true,
      payment_link: null,
      ...(params.clearLinkExpiry === false ? {} : { payment_link_expires_at: nowIso }),
      ...(params.extraPatch ?? {}),
    })
    .eq("id", params.bookingId)
    .eq("status", "pending_payment")
    .is("payment_completed_at", null)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, transitioned: false, creditReleased: false };

  const credit = await releaseCleaningCreditForBooking(admin, params.bookingId);
  if (!credit.ok && credit.error !== "reservation_not_found") {
    return { ok: false, error: `Cleaning Credit release failed: ${credit.error}` };
  }

  await cancelUnsentBookingPaymentRecoveryJobs(admin, params.bookingId, params.reason);
  return { ok: true, transitioned: true, creditReleased: credit.ok };
}
