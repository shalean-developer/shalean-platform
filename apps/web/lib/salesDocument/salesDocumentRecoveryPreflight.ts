/** Pure, fail-closed preflight for historical sales-document payment reconciliation.
 * This function has no database, Paystack, Zoho, or messaging side effects.
 * It does not authorize any write. Operational execution requires a separately
 * reviewed, transactionally safe repair.
 */
export type SalesDocumentRecoveryEvidence = {
  paymentReference: string;
  documentReference: string;
  paystackSuccessful: boolean;
  paystackAmountCents: number;
  paystackTransactionId: string;
  paystackFeeCents: number;
  paystackNetCents: number;
  paystackChannel: string;
  zohoInvoicePaid: boolean;
  zohoBalanceCents: number;
  documentStatus: string;
  documentPaidCents: number;
  documentTotalCents: number;
  linkedBookingPaidCents: number;
  linkedBookingStatus: string;
  ledgerReferenceExists: boolean;
  dedupReferenceExists: boolean;
};

export function assessSalesDocumentRecovery(e: SalesDocumentRecoveryEvidence) {
  const reasons: string[] = [];
  if (!e.paymentReference || e.paymentReference !== e.documentReference) reasons.push("reference_mismatch");
  if (!e.paystackSuccessful) reasons.push("paystack_unverified");
  if (!/^\\d+$/.test(e.paystackTransactionId.trim())) reasons.push("gateway_transaction_id_missing");
  if (!Number.isSafeInteger(e.paystackFeeCents) || e.paystackFeeCents < 0 ||
      !Number.isSafeInteger(e.paystackNetCents) ||
      e.paystackNetCents !== e.paystackAmountCents - e.paystackFeeCents) reasons.push("gateway_net_mismatch");
  if (!e.paystackChannel.trim()) reasons.push("gateway_channel_missing");
  if (!Number.isSafeInteger(e.paystackAmountCents) || e.paystackAmountCents <= 0 ||
      e.paystackAmountCents !== e.documentTotalCents) reasons.push("amount_mismatch");
  if (!e.zohoInvoicePaid || e.zohoBalanceCents !== 0) reasons.push("zoho_unsettled");
  if (!["sent", "accepted"].includes(e.documentStatus)) reasons.push("unexpected_document_status");
  if (e.linkedBookingStatus !== "pending_monthly") reasons.push("unexpected_booking_status");
  if (e.documentPaidCents !== 0 || e.linkedBookingPaidCents !== 0) reasons.push("existing_paid_value");
  if (e.ledgerReferenceExists || e.dedupReferenceExists) reasons.push("existing_payment_evidence");
  return { eligibleForManualReview: reasons.length === 0, reasons, writesAuthorized: false as const };
}
