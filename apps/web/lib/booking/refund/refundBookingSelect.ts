import type { BookingCustomerOwnershipColumn } from "@/lib/booking/bookingCustomerIdentity";

/**
 * Schema-aware select for admin refund load paths.
 * Uses the repository ownership column (`customer_id` or legacy `user_id`) —
 * never hardcodes a nonexistent column.
 */
export function buildRefundBookingSelect(ownershipColumn: BookingCustomerOwnershipColumn): string {
  return [
    "id",
    "status",
    "payment_status",
    "paystack_reference",
    "amount_paid_cents",
    "total_paid_cents",
    "total_paid_zar",
    "refunded_at",
    "refund_status",
    "monthly_invoice_id",
    ownershipColumn,
    "customer_email",
    "booking_snapshot",
    "currency",
  ].join(", ");
}

/** Select for referral clawback after refund/cancel (ownership-aware). */
export function buildRefundClawbackBookingSelect(
  ownershipColumn: BookingCustomerOwnershipColumn,
): string {
  return ["id", ownershipColumn, "customer_email", "status", "refunded_at", "refund_status"].join(
    ", ",
  );
}
