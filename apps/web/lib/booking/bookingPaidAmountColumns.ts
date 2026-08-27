/**
 * Booking collected-cash SoT: `amount_paid_cents`.
 *
 * Legacy columns `total_paid_cents` and `total_paid_zar` remain for older readers
 * but MUST be written only via this helper so they never disagree with cents.
 *
 * Write these columns only on successful settlement paths (Paystack finalize,
 * admin mark-paid, R0 covered settlement). Never write payable/quote totals here.
 */

export type BookingPaidAmountColumns = {
  amount_paid_cents: number;
  total_paid_cents: number;
  total_paid_zar: number;
};

/** Build a consistent paid-amount patch from gateway / settled cents. */
export function bookingPaidAmountColumnsFromCents(amountCents: number): BookingPaidAmountColumns {
  const cents = Math.max(0, Math.round(Number(amountCents) || 0));
  return {
    amount_paid_cents: cents,
    total_paid_cents: cents,
    // Preserve the exact monetary value represented by cents. Rounding to a
    // whole rand makes the legacy ZAR mirror disagree with the cents SoT.
    total_paid_zar: cents / 100,
  };
}

/** Same helper from ZAR settled amounts. */
export function bookingPaidAmountColumnsFromZar(amountZar: number): BookingPaidAmountColumns {
  const zar = Number(amountZar);
  const cents = Number.isFinite(zar) ? Math.max(0, Math.round(zar * 100)) : 0;
  return bookingPaidAmountColumnsFromCents(cents);
}

/** Explicit zero collected-cash patch for unpaid / pending_payment rows. */
export function bookingUncollectedCashColumns(): BookingPaidAmountColumns {
  return bookingPaidAmountColumnsFromCents(0);
}
