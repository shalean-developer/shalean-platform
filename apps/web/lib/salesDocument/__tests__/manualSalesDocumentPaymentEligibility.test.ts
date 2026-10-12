import { describe, expect, it } from "vitest";

import { salesDocumentCanRecordManualPayment } from "../types";

describe("SALES-PAYMENT-MANUAL-01 manual invoice settlement eligibility", () => {
  it.each(["draft", "sent", "accepted"])(
    "allows an unpaid invoice lifecycle state: %s",
    (status) => {
      expect(
        salesDocumentCanRecordManualPayment({
          document_type: "invoice",
          status,
        }),
      ).toBe(true);
    },
  );

  it.each(["requested", "paid", "refunded", "void", "expired"])(
    "rejects an invoice lifecycle state that is not manually payable: %s",
    (status) => {
      expect(
        salesDocumentCanRecordManualPayment({
          document_type: "invoice",
          status,
        }),
      ).toBe(false);
    },
  );

  it("never allows quotes to use the manual invoice settlement path", () => {
    expect(
      salesDocumentCanRecordManualPayment({
        document_type: "quote",
        status: "draft",
      }),
    ).toBe(false);
  });
});
