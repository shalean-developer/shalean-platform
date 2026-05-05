/**
 * Labels for recurring-generated bookings on the Paystack collection path.
 * Derived only — canonical state remains existing booking + recurring_bookings columns.
 */
export type RecurringPaymentState =
  | "awaiting_authorization"
  | "charge_scheduled"
  | "charged"
  | "retry_scheduled"
  | "failed"
  | "fallback_sent";

export type RecurringPaymentStateBookingInput = {
  is_recurring_generated: boolean | null;
  status: string | null;
  payment_status: string | null;
  recurring_retry_count: number | null;
  recurring_next_charge_attempt_at: string | null;
  recurring_first_failure_at: string | null;
  recurring_fallback_at: string | null;
};

/**
 * `recurringAuthorizationCode` comes from `recurring_bookings.paystack_authorization_code` (not stored on `bookings`).
 * @param maxChargeRetries — same cap as {@link recurringAutoChargeMaxRetries} when labeling `failed`.
 */
export function deriveRecurringPaymentState(
  booking: RecurringPaymentStateBookingInput,
  recurringAuthorizationCode: string | null | undefined,
  maxChargeRetries: number = 4,
): RecurringPaymentState | null {
  if (!booking.is_recurring_generated) return null;

  const paySt = String(booking.payment_status ?? "").trim().toLowerCase();
  if (paySt === "pending_monthly") return null;

  const status = String(booking.status ?? "").trim().toLowerCase();
  if (status !== "pending_payment") {
    return "charged";
  }

  if (booking.recurring_fallback_at != null && String(booking.recurring_fallback_at).trim() !== "") {
    return "fallback_sent";
  }

  const auth = String(recurringAuthorizationCode ?? "").trim();
  if (!auth) {
    return "awaiting_authorization";
  }

  const retries = Number(booking.recurring_retry_count ?? 0);
  if (retries > 0) {
    const nextRaw = booking.recurring_next_charge_attempt_at?.trim();
    if (nextRaw) {
      const t = Date.parse(nextRaw);
      if (Number.isFinite(t) && t > Date.now()) {
        return "retry_scheduled";
      }
    }
    const cap = Number.isFinite(maxChargeRetries) && maxChargeRetries >= 1 ? maxChargeRetries : 4;
    if (retries >= cap) {
      return "failed";
    }
    return "charge_scheduled";
  }

  return "charge_scheduled";
}
