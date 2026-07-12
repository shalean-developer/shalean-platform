const CUSTOMER_BOOKING_REF_RE = /^SHL-BK-\d{6,}$/i;

/** True when the value is a persisted customer reference (not a Paystack temp ref). */
export function isCustomerBookingReference(value: string | null | undefined): boolean {
  const t = String(value ?? "").trim();
  return CUSTOMER_BOOKING_REF_RE.test(t);
}

/**
 * Reference to show on the success page — never Paystack refs like `bv2_…` or UUIDs.
 */
export function displayCustomerBookingReference(params: {
  bookingReference?: string | null;
}): string | null {
  const ref = String(params.bookingReference ?? "").trim();
  if (isCustomerBookingReference(ref)) return ref.toUpperCase();
  return null;
}

export function formatCustomerBookingTotalPaid(zar: number): string {
  return `R${Math.round(zar).toLocaleString("en-ZA")}`;
}

/**
 * Amount to show as "Total paid" after checkout.
 * Prefer Paystack `amountCents` (what was charged) over snapshot `total_zar`,
 * which can be a pre-discount visit total and confuse customers.
 */
export function resolveCustomerTotalPaidZar(params: {
  amountCents?: number | null;
  snapshotTotalZar?: number | null;
}): number | null {
  const cents = params.amountCents;
  if (typeof cents === "number" && Number.isFinite(cents) && cents > 0) {
    return Math.round(cents / 100);
  }
  const snap = params.snapshotTotalZar;
  if (typeof snap === "number" && Number.isFinite(snap) && snap > 0) {
    return Math.round(snap);
  }
  return null;
}

/** Customer-facing ref for account pages — never Paystack temp refs like `bv2_…`. */
export function customerAccountBookingReference(params: {
  bookingId: string;
  bookingReference?: string | null;
}): string {
  const ref = displayCustomerBookingReference({ bookingReference: params.bookingReference });
  if (ref) return ref;
  const id = String(params.bookingId ?? "").trim();
  if (!id) return "—";
  return id.slice(0, 8).toUpperCase();
}
