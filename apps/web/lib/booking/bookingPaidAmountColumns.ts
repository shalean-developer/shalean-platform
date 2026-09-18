/**
 * Booking collected-cash SoT: `amount_paid_cents`.
 *
 * `total_paid_cents` mirrors exact cents. `total_paid_zar` is a rounded,
 * integer-compatible legacy mirror, never authoritative financial truth.
 *
 * Write these columns only on successful settlement paths (Paystack finalize,
 * admin mark-paid, R0 covered settlement). Never write payable/quote totals here.
 */

export type BookingPaidAmountColumns = {
  amount_paid_cents: number;
  total_paid_cents: number;
  total_paid_zar: number;
};

// The active bookings schema uses PostgreSQL integer for both cents columns.
const MAX_PAID_CENTS = 2_147_483_647;

/** Build a validated paid-amount patch from gateway / settled cents. */
export function bookingPaidAmountColumnsFromCents(amountCents: unknown): BookingPaidAmountColumns {
  if (
    typeof amountCents !== "number" ||
    !Number.isInteger(amountCents) ||
    amountCents < 0 ||
    amountCents > MAX_PAID_CENTS
  ) {
    throw new RangeError("Invalid collected-cash cents: expected an integer from 0 to 2147483647.");
  }
  return {
    amount_paid_cents: amountCents,
    total_paid_cents: amountCents,
    total_paid_zar: Math.round(amountCents / 100),
  };
}

/** Convert valid settled ZAR to the nearest cent, preserving the existing conversion convention. */
export function bookingPaidAmountColumnsFromZar(amountZar: number): BookingPaidAmountColumns {
  if (
    typeof amountZar !== "number" ||
    !Number.isFinite(amountZar) ||
    amountZar < 0 ||
    amountZar > MAX_PAID_CENTS / 100
  ) {
    throw new RangeError("Invalid collected-cash ZAR: expected a finite nonnegative amount within integer-cent bounds.");
  }
  return bookingPaidAmountColumnsFromCents(Math.round(amountZar * 100));
}

/** Explicit zero collected-cash patch for unpaid / pending_payment rows. */
export function bookingUncollectedCashColumns(): BookingPaidAmountColumns {
  return bookingPaidAmountColumnsFromCents(0);
}
