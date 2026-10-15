import { bookingHasAuthoritativeSettledPaymentStatus } from "@/lib/booking/bookingPaymentSettlementState";

/** Read-only Office payment display. Quote/legacy mirrors cannot override explicit cash cents. */
type BookingPayment = {
  amount_paid_cents?: unknown;
  total_paid_cents?: unknown;
  total_paid_zar?: unknown;
  payment_status?: unknown;
};
type TransactionPayment = {
  amount_cents?: unknown;
  settlement_status?: unknown;
  payment_channel?: unknown;
  paid_at?: unknown;
};
const normalized = (value: unknown) => String(value ?? '').trim().toLowerCase();
function cents(value: unknown): number | null {
  if (value == null || (typeof value === 'string' && !value.trim())) return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}
function bookingSettled(booking: BookingPayment): boolean {
  const status = normalized(booking.payment_status);
  // pending_monthly authorizes invoice billing; it does not establish collection.
  return status !== 'pending_monthly' && (bookingHasAuthoritativeSettledPaymentStatus(status) || status === 'settled');
}
export function officeBookingCollectedCents(booking: BookingPayment): number {
  // Explicit zero is authoritative, even when an old quote remains in a mirror.
  const collected = cents(booking.amount_paid_cents);
  if (collected !== null) return collected;
  if (!bookingSettled(booking)) return 0;
  const mirror = cents(booking.total_paid_cents);
  if (mirror !== null) return mirror;
  const legacyZar = cents(booking.total_paid_zar);
  return legacyZar === null ? 0 : Math.round(Number(booking.total_paid_zar) * 100);
}
export function officeBookingPaymentDisplay(booking: BookingPayment, payment?: TransactionPayment | null) {
  const status = normalized(payment?.settlement_status);
  const validTransaction = payment && normalized(payment.payment_channel) !== 'refund'
    && !['failed', 'reversed'].includes(status)
    && (status === 'settled' || (typeof payment.paid_at === 'string' && payment.paid_at.trim() !== ''));
  const transactionCents = validTransaction ? cents(payment.amount_cents) : null;
  const collectedCents = transactionCents ?? officeBookingCollectedCents(booking);
  return { collectedCents, settled: Boolean(validTransaction) || bookingSettled(booking) || collectedCents > 0 };
}
