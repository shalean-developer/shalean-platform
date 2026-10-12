import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  it("rejects zero-value invoices before payment side effects", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/salesDocument/markSalesDocumentPaidManual.ts"),
      "utf8",
    );

    expect(src).toContain('if (total <= 0 || balance <= 0)');
    expect(src).toContain('error: "invalid_payment_amount"');
    expect(src.indexOf('if (total <= 0 || balance <= 0)')).toBeLessThan(
      src.indexOf('.update({'),
    );
  });
});
