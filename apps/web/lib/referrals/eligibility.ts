import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";

/** Statuses that do not count toward referral first-booking eligibility. */
export const REFERRAL_INELIGIBLE_BOOKING_STATUSES = [
  "pending_payment",
  "payment_expired",
  "cancelled",
  "failed",
] as const;

const REFUND_EXCLUDED_STATUSES = new Set([
  "refunded",
  "full",
  "partial",
  "chargeback",
  "reversed",
  "failed_after_success",
]);

export type ReferralBookingCountMode = "paid" | "completed";

type BookingEligibilityRow = {
  status?: string | null;
  refunded_at?: string | null;
  refund_status?: string | null;
};

export function isBookingRefunded(row: BookingEligibilityRow): boolean {
  if (typeof row.refunded_at === "string" && row.refunded_at.trim().length > 0) return true;
  const rs = String(row.refund_status ?? "").trim().toLowerCase();
  return REFUND_EXCLUDED_STATUSES.has(rs);
}

export function isBookingEligibleForReferralCount(
  row: BookingEligibilityRow,
  mode: ReferralBookingCountMode,
): boolean {
  const status = String(row.status ?? "").trim().toLowerCase();
  if (REFERRAL_INELIGIBLE_BOOKING_STATUSES.includes(status as (typeof REFERRAL_INELIGIBLE_BOOKING_STATUSES)[number])) {
    return false;
  }
  if (isBookingRefunded(row)) return false;
  if (mode === "completed") return status === "completed";
  return true;
}

async function fetchBookingsForCustomer(
  admin: SupabaseClient,
  bookingUserId: string | null,
  customerEmail: string,
): Promise<BookingEligibilityRow[]> {
  const email = normalizeEmail(customerEmail || "");
  const select = "status, refunded_at, refund_status";

  if (bookingUserId) {
    const { data, error } = await admin
      .from("bookings")
      .select(select)
      .eq("user_id", bookingUserId);
    if (error) return [];
    return (data ?? []) as BookingEligibilityRow[];
  }

  if (!email) return [];
  const { data, error } = await admin.from("bookings").select(select).eq("customer_email", email);
  if (error) return [];
  return (data ?? []) as BookingEligibilityRow[];
}

/**
 * Count bookings that qualify for referral eligibility (first-booking discount / reward trigger).
 * Excludes cancelled, failed, pending payment, and refunded bookings.
 */
export async function countQualifyingBookingsForCustomer(
  admin: SupabaseClient,
  bookingUserId: string | null,
  customerEmail: string,
  mode: ReferralBookingCountMode = "paid",
): Promise<number> {
  const rows = await fetchBookingsForCustomer(admin, bookingUserId, customerEmail);
  return rows.filter((r) => isBookingEligibleForReferralCount(r, mode)).length;
}

/** @deprecated Use countQualifyingBookingsForCustomer */
export async function countPaidBookingsForCustomer(
  admin: SupabaseClient,
  bookingUserId: string | null,
  customerEmail: string,
): Promise<number> {
  return countQualifyingBookingsForCustomer(admin, bookingUserId, customerEmail, "paid");
}
