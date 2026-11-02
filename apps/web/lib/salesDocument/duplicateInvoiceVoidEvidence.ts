/**
 * Fail-closed decision for a Zoho-voided duplicate monthly invoice.
 * This is an evidence gate, not a payment or invoice mutation.
 */
export type DuplicateInvoiceVoidEvidence = {
  zohoInvoiceId: string;
  expectedZohoInvoiceId: string;
  zohoStatus: string;
  amountCents: number;
  paidCents: number;
  balanceCents: number;
  completedBookingStatus: string;
  completedBookingPaidCents: number;
  cancelledBookingStatus: string;
  cancelledBookingPaidCents: number;
  originalSalesInvoicePaid: boolean;
};
export function assessDuplicateInvoiceVoid(e: DuplicateInvoiceVoidEvidence) {
  const issues: string[] = [];
  if (!e.zohoInvoiceId || e.zohoInvoiceId !== e.expectedZohoInvoiceId) issues.push("invoice_identity");
  if (e.zohoStatus.toLowerCase() !== "void") issues.push("zoho_not_void");
  if (e.amountCents !== 36000 || e.paidCents !== 0 || e.balanceCents !== 36000) issues.push("duplicate_balance_changed");
  if (e.completedBookingStatus !== "completed" || e.completedBookingPaidCents !== 36000) issues.push("completed_booking_changed");
  if (e.cancelledBookingStatus !== "cancelled" || e.cancelledBookingPaidCents !== 0) issues.push("cancelled_booking_changed");
  if (!e.originalSalesInvoicePaid) issues.push("original_invoice_not_paid");
  return { evidenceConsistent: issues.length === 0, issues, productionWriteAuthorized: false as const };
}
