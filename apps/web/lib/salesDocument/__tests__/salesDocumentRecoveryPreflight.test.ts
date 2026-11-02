import { describe, expect, it } from "vitest";
import { assessSalesDocumentRecovery, type SalesDocumentRecoveryEvidence } from "../salesDocumentRecoveryPreflight";

const valid: SalesDocumentRecoveryEvidence = {
  paymentReference: "sd_inv_test", documentReference: "sd_inv_test",
  paystackSuccessful: true, paystackAmountCents: 36000,
  zohoInvoicePaid: true, zohoBalanceCents: 0,
  documentStatus: "sent", documentPaidCents: 0, documentTotalCents: 36000,
  linkedBookingPaidCents: 0, ledgerReferenceExists: false, dedupReferenceExists: false,
};

describe("historical sales-document recovery preflight (no writes)", () => {
  it("recognizes complete evidence but never authorizes a write", () => {
    expect(assessSalesDocumentRecovery(valid)).toEqual({
      eligibleForManualReview: true, reasons: [], writesAuthorized: false,
    });
  });
  it.each([
    ["unverified payment", { paystackSuccessful: false }],
    ["reference mismatch", { documentReference: "other" }],
    ["amount mismatch", { paystackAmountCents: 35999 }],
    ["unpaid Zoho", { zohoInvoicePaid: false }],
    ["Zoho balance", { zohoBalanceCents: 36000 }],
    ["existing document payment", { documentPaidCents: 36000 }],
    ["existing booking payment", { linkedBookingPaidCents: 36000 }],
    ["existing ledger", { ledgerReferenceExists: true }],
    ["existing dedup", { dedupReferenceExists: true }],
    ["unexpected state", { documentStatus: "paid" }],
  ] as const)("%s fails closed", (_, patch) => {
    const result = assessSalesDocumentRecovery({ ...valid, ...patch });
    expect(result.eligibleForManualReview).toBe(false);
    expect(result.writesAuthorized).toBe(false);
  });
});
