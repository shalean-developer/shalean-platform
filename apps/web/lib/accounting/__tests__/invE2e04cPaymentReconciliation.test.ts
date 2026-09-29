import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("INV-E2E-04C payment reconciliation contract", () => {
  it("uses the Zoho invoice customer and balance before recording payment", () => {
    const src = readFileSync(
      resolve(process.cwd(), "lib/accounting/processAccountingSyncQueue.ts"),
      "utf8",
    );

    expect(src).toContain("const zohoInvoice = await getZohoInvoice(zohoInvoiceId)");
    expect(src).toContain("contactId: zohoInvoice.customerId ?? undefined");
    expect(src).toContain("zoho_invoice_already_settled");
    expect(src).toContain("zoho_balance_mismatch:");
    expect(src).toContain("zoho_invoice_lookup_failed:");
  });

  it("does not auto-cap a payment to a smaller Zoho balance", () => {
    const src = readFileSync(
      resolve(process.cwd(), "lib/accounting/processAccountingSyncQueue.ts"),
      "utf8",
    );

    expect(src).toContain("if (pt.amount_cents > zohoInvoice.balanceCents)");
    expect(src).not.toContain("Math.min(pt.amount_cents, zohoInvoice.balanceCents)");
  });
});
