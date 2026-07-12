/**
 * Booking collected-cash SoT: `amount_paid_cents`.
 *
 * Legacy columns `total_paid_cents` and `total_paid_zar` remain for older readers
 * but MUST be written only via this helper so they never disagree with cents.
 */

export type BookingPaidAmountColumns = {
  amount_paid_cents: number;
  total_paid_cents: number;
  total_paid_zar: number;
};

/** Build a consistent paid-amount patch from gateway / settled cents (ZAR). */
export function bookingPaidAmountColumnsFromCents(amountCents: number): BookingPaidAmountColumns {
  const cents = Math.max(0, Math.round(Number(amountCents) || 0));
  return {
    amount_paid_cents: cents,
    total_paid_cents: cents,
    total_paid_zar: Math.round(cents / 100),
  };
}

/** Same helper from whole-ZAR display amounts (e.g. confirm payAmountZar). */
export function bookingPaidAmountColumnsFromZar(amountZar: number): BookingPaidAmountColumns {
  const zar = Number(amountZar);
  const cents = Number.isFinite(zar) ? Math.max(0, Math.round(zar * 100)) : 0;
  return bookingPaidAmountColumnsFromCents(cents);
}
