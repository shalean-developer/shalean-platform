import type { DashboardBooking } from "@/lib/dashboard/types";
import { billingMonthFromYmd } from "@/lib/dashboard/bookingSlotTimes";

export function isMonthlyLinkedForReschedule(booking: DashboardBooking): boolean {
  const r = booking.raw;
  const ps = String(r.payment_status ?? "")
    .trim()
    .toLowerCase();
  return Boolean(r.monthly_invoice_id || ps === "pending_monthly" || r.is_monthly_billing_booking);
}

/** True when API would reject with 409 (monthly visit cannot move to another billing month). */
export function rescheduleCrossMonthBlocked(booking: DashboardBooking, newDateYmd: string): boolean {
  if (!isMonthlyLinkedForReschedule(booking)) return false;
  const oldYm = billingMonthFromYmd(booking.date);
  const newYm = billingMonthFromYmd(newDateYmd.trim());
  return Boolean(oldYm && newYm && oldYm !== newYm);
}
