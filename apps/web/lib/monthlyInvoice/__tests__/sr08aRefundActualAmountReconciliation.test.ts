import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd());
const source = fs.readFileSync(
  path.join(repoRoot, "lib/monthlyInvoice/refundMonthlyInvoicePayment.ts"),
  "utf8",
);

describe("SR-08A monthly invoice refund amount reconciliation", () => {
  it("uses the actual gateway-refunded amount for downstream accounting and customer evidence", () => {
    expect(source).toContain("actualRefundAmountCents = refundAmount");
    expect(source).toContain("amountCents: actualRefundAmountCents");
    expect(source).toContain("amount_cents: actualRefundAmountCents");

    const actualAmountUses = source.match(/actualRefundAmountCents/g) ?? [];
    expect(actualAmountUses.length).toBeGreaterThanOrEqual(5);
  });

  it("keeps manual refunds on the recorded invoice amount when no gateway refund is executed", () => {
    expect(source).toContain("let actualRefundAmountCents = amountCents");
    expect(source).toContain("} else if (chargeRef) {");
    expect(source).toContain("actualRefundAmountCents = refundAmount");
  });
});
