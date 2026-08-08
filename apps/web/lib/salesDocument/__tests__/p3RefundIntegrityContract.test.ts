import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const refundSource = readFileSync(
  path.resolve(__dirname, "..", "refundSalesDocumentPayment.ts"),
  "utf8",
);

describe("P3 sales-document refund integrity contract", () => {
  it("counts every captured Paystack charge before refunding", () => {
    expect(refundSource).toContain(
      '.select("charge_reference, amount_cents", { count: "exact" })',
    );
  });

  it("fails closed when a sales document has multiple captured charges", () => {
    expect(refundSource).toContain('error: "multi_charge_refund_unsupported"');
    expect(refundSource).toMatch(/if \(\(count \?\? chargeRows\?\.length \?\? 0\) > 1\)/);
  });

  it("does not mark the document refunded until charge resolution succeeds", () => {
    const resolveIndex = refundSource.indexOf(
      "const resolved = await resolveChargeReference(admin, row.id, row.paystackReference)",
    );
    const markIndex = refundSource.indexOf("const marked = await markSalesDocumentRefunded");

    // The implementation uses row.paystack_reference; keep this ordering assertion
    // resilient while still proving that the charge guard runs before local mutation.
    const actualResolveIndex = refundSource.indexOf(
      "const resolved = await resolveChargeReference(admin, row.id, row.paystack_reference)",
    );
    expect(Math.max(resolveIndex, actualResolveIndex)).toBeGreaterThan(-1);
    expect(markIndex).toBeGreaterThan(Math.max(resolveIndex, actualResolveIndex));
  });
});
