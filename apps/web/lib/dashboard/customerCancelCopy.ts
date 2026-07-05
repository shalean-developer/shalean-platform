import { isMonthlyBilledBookingRow } from "@/lib/dashboard/customerPaymentDisplay";
import type { BookingRow } from "@/lib/dashboard/types";

function invoiceStatusFromRow(row: BookingRow): string | null {
  const nested = row.monthly_invoices as { status?: string } | null | undefined;
  if (nested && typeof nested === "object" && typeof nested.status === "string") {
    return nested.status.trim().toLowerCase();
  }
  return null;
}

function hasCapturedPayment(row: BookingRow): boolean {
  if (String(row.payment_completed_at ?? "").trim()) return true;
  const cents = row.amount_paid_cents;
  return typeof cents === "number" && cents > 0;
}

/**
 * Trust-first copy for the cancel confirmation dialog.
 * Monthly-billed visits get invoice wording; pay-as-you-go visits get checkout/refund copy.
 */
export function customerCancelBookingHint(row: BookingRow): string {
  if (!isMonthlyBilledBookingRow(row)) {
    const st = String(row.status ?? "")
      .trim()
      .toLowerCase();
    if (st === "pending_payment" || st === "pending") {
      if (!hasCapturedPayment(row)) {
        return "This will cancel the booking before payment is taken.";
      }
    }
    if (hasCapturedPayment(row)) {
      return "Your booking will be cancelled. Refunds, if eligible, follow our terms — we'll email you or you can contact support.";
    }
    return "This will mark your visit as cancelled.";
  }

  const invId = row.monthly_invoice_id;
  const st = invoiceStatusFromRow(row);
  const finalized =
    st === "sent" || st === "partially_paid" || st === "overdue" || st === "paid";

  if (invId && finalized) {
    return "If you cancel, changes will be reflected on your next invoice (or we'll contact you if a credit applies).";
  }
  return "This booking will be removed from your monthly invoice if it hasn't been sent for payment yet.";
}
