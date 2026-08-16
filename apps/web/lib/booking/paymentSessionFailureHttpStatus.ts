export type PaymentSessionFailureLike = {
  errorCode?: string | null;
  retryable?: boolean | null;
};

/**
 * Maps payment-session failures to HTTP status codes.
 *
 * PAYMENT_BOOKING_NOT_FOUND intentionally returns 401 for now because the booking-v2
 * payment UI treats 401 as a hard stop and does not execute its legacy Paystack Inline
 * fallback. Returning 404 here previously allowed the browser to charge a customer even
 * though the server could no longer read the booking row.
 *
 * Once the legacy Inline fallback is removed from Step4Payment, this can return a more
 * conventional 404/409 without weakening the payment-integrity guard.
 */
export function paymentSessionFailureHttpStatus(session: PaymentSessionFailureLike): number {
  if (session.errorCode === "PAYMENT_ACCESS_DENIED") return 403;
  if (session.errorCode === "PAYMENT_BOOKING_NOT_FOUND") return 401;
  if (session.errorCode === "PAYMENT_ALREADY_COMPLETED") return 409;
  if (session.retryable) return 503;
  return 409;
}
