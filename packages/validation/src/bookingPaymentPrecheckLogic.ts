/** Shared rules for `/api/bookings/payment-precheck` (inline Paystack before SDK open). */

const MISMATCH_EPS_ZAR = 2;

export type PaymentPrecheckRow = {
  id: string;
  status: string | null;
  total_price: number | string | null;
  payment_completed_at: string | null;
};

export type PaymentPrecheckResult =
  | { ok: true }
  | { ok: false; error: string; httpStatus: number; reason: string };

export function evaluateBookingPaymentPrecheck(
  row: PaymentPrecheckRow | null,
  expectedTotalZar: number,
): PaymentPrecheckResult {
  if (!row) {
    return { ok: false, error: "Booking not found.", httpStatus: 404, reason: "not_found" };
  }
  const st = String(row.status ?? "").toLowerCase();
  if (st !== "pending_payment") {
    const paid = Boolean(String(row.payment_completed_at ?? "").trim());
    return {
      ok: false,
      error: paid
        ? "This booking is already paid."
        : "This booking is not awaiting payment. Refresh or contact support.",
      httpStatus: 409,
      reason: "wrong_status",
    };
  }
  const tp = row.total_price != null && row.total_price !== "" ? Number(row.total_price) : NaN;
  if (!Number.isFinite(tp) || tp <= 0) {
    return {
      ok: false,
      error: "Booking amount is invalid. Contact support.",
      httpStatus: 409,
      reason: "invalid_row_total",
    };
  }
  if (Math.abs(tp - expectedTotalZar) > MISMATCH_EPS_ZAR) {
    return {
      ok: false,
      error: "The price shown no longer matches this booking. Refresh and try again.",
      httpStatus: 409,
      reason: "total_mismatch",
    };
  }
  return { ok: true };
}
