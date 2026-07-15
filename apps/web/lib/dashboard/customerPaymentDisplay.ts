import { isAuthoritativeBookingCompleted } from "@/lib/booking/deriveBookingOperationalPhase";
import type { BookingRow, DashboardBooking } from "@/lib/dashboard/types";

export type CustomerPaymentBadgeTone = "success" | "warning" | "neutral" | "error";

export type CustomerPaymentRowDisplay = {
  badgeLabel: string;
  badgeTone: CustomerPaymentBadgeTone;
  /** Count toward “payments made” / “total paid” stats on `/account/payments`. */
  countsAsPaidTransaction: boolean;
  rowMuted: boolean;
};

/** Row is on a monthly invoice cycle (not a one-off Paystack checkout). */
export function isMonthlyBilledBookingRow(row: BookingRow): boolean {
  const ps = String(row.payment_status ?? "")
    .trim()
    .toLowerCase();
  if (ps === "pending_monthly") return true;
  if (row.is_monthly_billing_booking === true) return true;
  const invId = row.monthly_invoice_id;
  if (invId != null && String(invId).trim() !== "") return true;
  const bt = String(row.billing_type ?? "")
    .trim()
    .toLowerCase();
  return bt === "monthly_contract" || bt === "recurring_invoice";
}

function hasCapturedPaystackPayment(row: BookingRow): boolean {
  if (String(row.payment_completed_at ?? "").trim()) return true;
  if (String(row.paystack_reference ?? "").trim()) return true;
  const cents = row.amount_paid_cents;
  return typeof cents === "number" && cents > 0;
}

/**
 * Customer `/account/payments` row label + stats eligibility.
 * Distinct from {@link customerBookingStatusLabel} — payment-centric, not operational.
 */
export function customerPaymentRowDisplay(booking: DashboardBooking): CustomerPaymentRowDisplay {
  const row = booking.raw;
  const st = String(booking.status ?? "")
    .trim()
    .toLowerCase();
  const ps = String(row.payment_status ?? "")
    .trim()
    .toLowerCase();
  const authDone = isAuthoritativeBookingCompleted({
    status: row.status ?? booking.status,
    completed_at: row.completed_at,
  });

  if (st === "cancelled") {
    return {
      badgeLabel: "Cancelled",
      badgeTone: "neutral",
      countsAsPaidTransaction: false,
      rowMuted: true,
    };
  }
  if (st === "failed" || ps === "failed") {
    return {
      badgeLabel: "Failed",
      badgeTone: "error",
      countsAsPaidTransaction: false,
      rowMuted: true,
    };
  }
  if (ps === "pending_monthly" || (isMonthlyBilledBookingRow(row) && !hasCapturedPaystackPayment(row))) {
    return {
      badgeLabel: authDone ? "Billed monthly" : "Monthly invoice",
      badgeTone: "warning",
      countsAsPaidTransaction: false,
      rowMuted: false,
    };
  }
  if (st === "pending_payment" || (ps === "pending" && !hasCapturedPaystackPayment(row))) {
    return {
      badgeLabel: "Awaiting payment",
      badgeTone: "warning",
      countsAsPaidTransaction: false,
      rowMuted: false,
    };
  }

  const refundStatus = String(
    (row as { refund_status?: string | null }).refund_status ?? "",
  )
    .trim()
    .toLowerCase();
  const refundedAt = String((row as { refunded_at?: string | null }).refunded_at ?? "").trim();
  if (ps === "refunded" || refundStatus === "full" || refundStatus === "chargeback" || refundStatus === "reversed") {
    return {
      badgeLabel: refundStatus === "chargeback" ? "Chargeback" : "Fully refunded",
      badgeTone: "neutral",
      countsAsPaidTransaction: false,
      rowMuted: true,
    };
  }
  if (refundStatus === "partial" || refundedAt) {
    return {
      badgeLabel: "Partially refunded",
      badgeTone: "warning",
      countsAsPaidTransaction: true,
      rowMuted: false,
    };
  }

  return {
    badgeLabel: "Paid",
    badgeTone: "success",
    countsAsPaidTransaction: true,
    rowMuted: false,
  };
}
