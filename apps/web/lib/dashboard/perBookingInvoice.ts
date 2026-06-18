import type { DashboardBooking } from "@/lib/dashboard/types";

/**
 * A per-visit invoice derived from a paid, non-monthly booking.
 * Per-booking customers pay upfront per visit and never get a `monthly_invoices`
 * row, so we surface each paid booking as its own invoice on the customer UI.
 */
export type PerBookingInvoice = {
  bookingId: string;
  serviceName: string;
  date: string;
  /** Total charged in ZAR (VAT incl.) */
  amountZar: number;
  status: "paid";
  createdAt: string;
  /** Zoho Books invoice id when synced; enables the in-app invoice PDF link. */
  zohoInvoiceId: string | null;
};

/**
 * Returns true when a booking represents a paid, per-visit (non-monthly) invoice.
 * Mirrors the dashboard "Paid" definition: not awaiting payment, not monthly-billed,
 * not cancelled/failed.
 */
export function isPaidPerBookingInvoice(b: DashboardBooking): boolean {
  const raw = b.raw;
  const paymentStatus = String(raw.payment_status ?? "").toLowerCase();
  const isMonthly = raw.is_monthly_billing_booking === true || paymentStatus === "pending_monthly";
  if (isMonthly) return false;
  if (b.status === "pending_payment" || b.status === "cancelled" || b.status === "failed") return false;
  if (b.status === "payment_mismatch" || b.status === "payment_reconciliation_required") return false;
  // Paid upfront marker (set by finalizePaidBooking) OR any active visit with a price.
  return paymentStatus === "success" || b.priceZar > 0;
}

/**
 * Maps paid bookings to per-visit invoices, newest first.
 */
export function perBookingInvoicesFromBookings(bookings: DashboardBooking[]): PerBookingInvoice[] {
  return bookings
    .filter(isPaidPerBookingInvoice)
    .map((b) => ({
      bookingId: b.id,
      serviceName: b.serviceName,
      date: b.date,
      amountZar: b.priceZar,
      status: "paid" as const,
      createdAt: b.createdAt,
      zohoInvoiceId: b.raw.zoho_invoice_id ?? null,
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}
