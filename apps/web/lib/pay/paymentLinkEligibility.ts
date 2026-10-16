import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bookingHasAuthoritativeSettledPaymentStatus } from "@/lib/booking/bookingPaymentSettlementState";
import { fetchPaystackTransactionVerify } from "@/lib/payments/verifyPaystackTransaction";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

export type PaymentLinkEligibility = { allowed: true } | { allowed: false; reason: string; retryable?: boolean };

/** Read-only final check. Uncertain gateway/database state must never solicit another payment. */
export async function checkPaymentLinkEligibility(
  admin: SupabaseClient,
  bookingId: string,
  reference: string,
  options?: { allowExpired?: boolean; allowUninitialized?: boolean },
): Promise<PaymentLinkEligibility> {
  const eligibleStatus = (status: string) => status === "pending_payment" || (options?.allowExpired && status === "payment_expired");
  const suppress = async (reason: string): Promise<PaymentLinkEligibility> => {
    await logSystemEvent({ level: "info", source: "payment_link_suppressed", message: reason,
      context: { bookingId, reference } });
    return { allowed: false, reason,
      ...(["booking_unavailable", "payment_lookup_failed", "gateway_unavailable", "gateway_pending", "gateway_processing", "gateway_ongoing", "gateway_queued"].includes(reason) ? { retryable: true } : {}) };
  };
  const { data: booking, error } = await admin.from("bookings")
    .select("status, payment_status, payment_completed_at, paid_at, payment_transaction_id, paystack_reference, payment_link, monthly_invoice_id, is_monthly_billing_booking")
    .eq("id", bookingId).maybeSingle();
  if (error || !booking) return suppress("booking_unavailable");
  if (bookingHasAuthoritativeSettledPaymentStatus(booking.payment_status) || booking.payment_completed_at ||
      booking.paid_at || booking.payment_transaction_id) return suppress("booking_paid");
  if (!eligibleStatus(booking.status)) return suppress("booking_not_pending_payment");
  if (booking.monthly_invoice_id || booking.is_monthly_billing_booking) return suppress("monthly_billing");
  const storedReference = String(booking.paystack_reference ?? "").trim();
  const canRecoverUninitialized = Boolean(options?.allowUninitialized && !String(booking.payment_link ?? "").trim());
  if (reference !== storedReference || (!reference && !canRecoverUninitialized)) return suppress("stale_reference");

  let paymentQuery = admin.from("payment_transactions").select("id").eq("gateway", "paystack");
  paymentQuery = reference ? paymentQuery.eq("gateway_reference", reference) : paymentQuery.eq("booking_id", bookingId);
  const { data: payment, error: paymentError } = await paymentQuery.maybeSingle();
  if (paymentError) return suppress("payment_lookup_failed");
  if (payment) return suppress("payment_recorded");
  let uninitialized = !reference && canRecoverUninitialized;
  if (reference) {
    const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
    if (!secret) return suppress("gateway_unavailable");
    const verified = await fetchPaystackTransactionVerify(reference, secret);
    // booking-v2 persists a reference before initialization. Only Paystack's explicit
    // documented missing-transaction response permits checkout recovery; outages do not.
    uninitialized = canRecoverUninitialized && verified.status === false && !verified.data &&
      /^(Transaction reference not found|Transaction not found)\.?$/i.test(String(verified.message ?? "").trim());
    if (!uninitialized && (!verified.status || !verified.data || verified.data.reference !== reference)) return suppress("gateway_unavailable");
    const status = String(verified.data?.status ?? "").toLowerCase();
    if (status === "success") {
      await reportOperationalIssue("warn", "paymentLinkEligibility", "paid_booking_requires_reconciliation", { bookingId, reference });
      return suppress("gateway_paid");
    }
    // In-flight and reversed transactions also need time/review, never another request to pay.
    if (!uninitialized && status !== "abandoned" && status !== "failed") return suppress("gateway_" + (status || "unknown"));
  }

  // Payment/webhook or reference replacement can race the remote request above.
  const { data: latest, error: latestError } = await admin.from("bookings")
    .select("status, payment_status, payment_completed_at, paid_at, payment_transaction_id, paystack_reference, payment_link, monthly_invoice_id, is_monthly_billing_booking")
    .eq("id", bookingId).maybeSingle();
  if (latestError || !latest) return suppress("booking_unavailable");
  if (!eligibleStatus(latest.status) || String(latest.paystack_reference ?? "").trim() !== reference ||
      (uninitialized && String(latest.payment_link ?? "").trim()) || latest.monthly_invoice_id || latest.is_monthly_billing_booking ||
      bookingHasAuthoritativeSettledPaymentStatus(latest.payment_status) || latest.payment_completed_at ||
      latest.paid_at || latest.payment_transaction_id) return suppress("booking_changed");
  return { allowed: true };
}

export type AutomaticPaymentReminderStage = "first" | "final";

/** Both automatic reminder jobs compete for the same DB-unique claim. Fail closed on DB errors. */
export async function claimAutomaticPaymentReminder(
  admin: SupabaseClient, bookingId: string, reference: string, stage: AutomaticPaymentReminderStage,
): Promise<boolean> {
  if (!bookingId || !reference) return false;
  const { error } = await admin.from("notification_idempotency_claims").insert({
    booking_id: bookingId, reference, event_type: `automatic_payment_reminder_${stage}`, channel: "email",
  });
  if (!error) return true;
  if (error.code !== "23505") await reportOperationalIssue("warn", "paymentReminderClaim", error.message, { bookingId });
  return false;
}

export async function releaseAutomaticPaymentReminder(
  admin: SupabaseClient, reference: string, stage: AutomaticPaymentReminderStage,
): Promise<void> {
  const { error } = await admin.from("notification_idempotency_claims").delete()
    .eq("reference", reference).eq("event_type", `automatic_payment_reminder_${stage}`).eq("channel", "email");
  if (error) await reportOperationalIssue("warn", "paymentReminderClaim/release", error.message, { reference });
}
