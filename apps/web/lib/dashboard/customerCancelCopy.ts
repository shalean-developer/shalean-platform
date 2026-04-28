import type { BookingRow } from "@/lib/dashboard/types";

function invoiceStatusFromRow(row: BookingRow): string | null {
  const nested = row.monthly_invoices as { status?: string } | null | undefined;
  if (nested && typeof nested === "object" && typeof nested.status === "string") {
    return nested.status.trim().toLowerCase();
  }
  return null;
}

/**
 * Trust-first copy for the cancel confirmation dialog (monthly billing).
 */
export function customerCancelBookingHint(row: BookingRow): string {
  const invId = row.monthly_invoice_id;
  const st = invoiceStatusFromRow(row);
  const finalized =
    st === "sent" || st === "partially_paid" || st === "overdue" || st === "paid";

  if (invId && finalized) {
    return "If you cancel, changes will be reflected on your next invoice (or we’ll contact you if a credit applies).";
  }
  return "This booking will be removed from your monthly invoice if it hasn’t been sent for payment yet.";
}
