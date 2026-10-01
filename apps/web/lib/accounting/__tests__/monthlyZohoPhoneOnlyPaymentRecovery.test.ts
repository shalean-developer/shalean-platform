import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("monthly Zoho phone-only payment recovery", () => {
  it("creates a missing monthly Zoho invoice before applying payment", () => {
    const src = readFileSync(
      join(root, "lib/accounting/processAccountingSyncQueue.ts"),
      "utf8",
    );

    expect(src).toContain("syncMonthlyInvoiceToZohoBooks");
    expect(src).toContain('"monthly_invoice_zero_total_no_zoho"');
    expect(src).toContain("zoho_invoice_create_before_payment_failed");
    expect(src).toContain("balanceZar: totalCents / 100");
  });

  it("keeps customer email optional so phone-only contacts can resolve", () => {
    const src = readFileSync(
      join(root, "lib/zoho/resolveZohoCustomerContact.ts"),
      "utf8",
    );

    expect(src).toContain("if (!email && !phone)");
    expect(src).toContain("...(email ? { email } : {})");
    expect(src).toContain("...(phone ? { phone } : {})");
  });
});
