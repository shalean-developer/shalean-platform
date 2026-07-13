import type { BookingPaidSignalRow } from "@/lib/payout/bookingEarningsIntegrity";
import { bookingIsCustomerPaymentSettled } from "@/lib/booking/bookingPaymentSettlementState";
import { PAYMENT_RECOVERY_SKIP, type PaymentRecoveryJobType } from "@/lib/booking/paymentRecoverySkipReasons";
import { classifySendError, TERMINAL_FAILURE_ATTEMPTS } from "@/lib/booking/lifecycleEmailGuards";

export { classifySendError, TERMINAL_FAILURE_ATTEMPTS };

const UNPAID_PAYMENT_STATUSES = new Set(["", "pending", "failed", "unpaid"]);

const REMINDER_JOB_TYPES = new Set<PaymentRecoveryJobType>(["payment_reminder_1h", "payment_reminder_24h"]);

export function isBookingCancelledForPaymentRecovery(booking: { status?: string | null }): boolean {
  return String(booking.status ?? "").trim().toLowerCase() === "cancelled";
}

export function isBookingPaymentExpiredStatus(booking: { status?: string | null }): boolean {
  return String(booking.status ?? "").trim().toLowerCase() === "payment_expired";
}

/** Settlement-sensitive: authoritative payment_status (+ documented historical compatibility). */
export function hasSuccessfulPaystackPayment(booking: Record<string, unknown>): boolean {
  return bookingIsCustomerPaymentSettled(booking as BookingPaidSignalRow & { status?: string | null });
}

export function isBookingUnpaidForPaymentRecovery(booking: Record<string, unknown>): boolean {
  if (hasSuccessfulPaystackPayment(booking)) return false;
  const st = String(booking.status ?? "").trim().toLowerCase();
  if (st === "cancelled") return false;
  if (st !== "pending_payment" && st !== "payment_expired" && st !== "failed") {
    const ps = String(booking.payment_status ?? "").trim().toLowerCase();
    if (!UNPAID_PAYMENT_STATUSES.has(ps) && ps !== "failed") return false;
  }
  const ps = String(booking.payment_status ?? "").trim().toLowerCase();
  if (ps === "success" || ps === "paid" || ps === "succeeded" || ps === "pending_monthly") return false;
  return true;
}

export type PaymentRecoveryEligibility =
  | { eligible: true }
  | { eligible: false; reason: string; action: "skip" | "cancel" };

export function evaluatePaymentRecoveryJobEligibility(
  booking: Record<string, unknown>,
  jobType: string,
): PaymentRecoveryEligibility {
  if (!booking || typeof booking !== "object") {
    return { eligible: false, reason: PAYMENT_RECOVERY_SKIP.bookingNotFound, action: "skip" };
  }

  if (isBookingCancelledForPaymentRecovery(booking)) {
    return { eligible: false, reason: PAYMENT_RECOVERY_SKIP.bookingCancelled, action: "cancel" };
  }

  if (hasSuccessfulPaystackPayment(booking)) {
    return { eligible: false, reason: PAYMENT_RECOVERY_SKIP.bookingPaid, action: "cancel" };
  }

  if (!isBookingUnpaidForPaymentRecovery(booking)) {
    return { eligible: false, reason: PAYMENT_RECOVERY_SKIP.bookingPaid, action: "cancel" };
  }

  const expired = isBookingPaymentExpiredStatus(booking);
  if (expired && REMINDER_JOB_TYPES.has(jobType as PaymentRecoveryJobType)) {
    return { eligible: false, reason: PAYMENT_RECOVERY_SKIP.bookingAlreadyExpired, action: "skip" };
  }

  if (jobType === "booking_payment_expired") {
    if (expired || String(booking.status ?? "").trim().toLowerCase() === "pending_payment") {
      return { eligible: true };
    }
    return { eligible: false, reason: PAYMENT_RECOVERY_SKIP.bookingPaid, action: "cancel" };
  }

  if (String(booking.status ?? "").trim().toLowerCase() !== "pending_payment") {
    return { eligible: false, reason: PAYMENT_RECOVERY_SKIP.bookingAlreadyExpired, action: "skip" };
  }

  return { eligible: true };
}
