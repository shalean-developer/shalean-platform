export type PaymentSessionFailureLike = {
  errorCode?: string | null;
  retryable?: boolean | null;
};

/**
 * Maps payment-session failures to HTTP status codes.
 *
 * PAYMENT_BOOKING_NOT_FOUND returns 404. The booking-v2 payment UI now fails closed
 * unless the server returns a ready payment session with an authorization URL, so a
 * missing booking row cannot fall through to a client-side Paystack payment path.
 */
export function paymentSessionFailureHttpStatus(session: PaymentSessionFailureLike): number {
  if (session.errorCode === "PAYMENT_ACCESS_DENIED") return 403;
  if (session.errorCode === "PAYMENT_BOOKING_NOT_FOUND") return 404;
  if (session.errorCode === "PAYMENT_ALREADY_COMPLETED") return 409;
  if (session.retryable) return 503;
  return 409;
}
