import {
  canonicalDbBookingStatus,
  isCustomerCancellableBookingStatus,
  isCustomerReschedulableBookingStatus,
} from "@shalean/types";

export type ModifyEligibilityRow = {
  status?: string | null;
  started_at?: string | null;
  en_route_at?: string | null;
  date?: string | null;
  monthly_invoice_id?: string | null;
  payment_status?: string | null;
  is_monthly_billing_booking?: boolean | null;
};

function hasTimestamp(value: string | null | undefined): boolean {
  return Boolean(value && String(value).trim());
}

export function canCancelBooking(row: ModifyEligibilityRow): boolean {
  if (!isCustomerCancellableBookingStatus(row.status)) return false;
  if (hasTimestamp(row.started_at)) return false;
  return true;
}

export function canRescheduleBooking(row: ModifyEligibilityRow): boolean {
  if (!isCustomerReschedulableBookingStatus(row.status)) return false;
  if (hasTimestamp(row.started_at) || hasTimestamp(row.en_route_at)) return false;
  return true;
}

export function canRebookBooking(row: ModifyEligibilityRow): boolean {
  const status = canonicalDbBookingStatus(row.status);
  return status === "completed" || status === "cancelled";
}

/** Simple YYYY-MM compare — mirrors web `billingMonthFromYmd`. */
export function billingMonthFromYmd(ymd: string): string | null {
  const s = String(ymd ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s.slice(0, 7);
}

export function isMonthlyLinkedForReschedule(row: ModifyEligibilityRow): boolean {
  const ps = String(row.payment_status ?? "")
    .trim()
    .toLowerCase();
  return Boolean(
    row.monthly_invoice_id || ps === "pending_monthly" || row.is_monthly_billing_booking,
  );
}

/** True when API would reject with 409 (monthly visit cannot move to another billing month). */
export function isRescheduleCrossMonthBlocked(
  row: ModifyEligibilityRow,
  newDateYmd: string,
): boolean {
  if (!isMonthlyLinkedForReschedule(row)) return false;
  const oldYm = billingMonthFromYmd(String(row.date ?? ""));
  const newYm = billingMonthFromYmd(newDateYmd.trim());
  return Boolean(oldYm && newYm && oldYm !== newYm);
}
