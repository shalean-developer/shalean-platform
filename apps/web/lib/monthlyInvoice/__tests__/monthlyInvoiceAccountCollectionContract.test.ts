import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("monthly invoice statement collection contract", () => {
  it("keeps prior balances separate from current invoice accounting total", () => {
    const src = source("lib/monthlyInvoice/monthlyInvoiceAccountCollection.ts");
    expect(src).toContain("previous_balance_cents");
    expect(src).toContain("collection_total_cents: previous + anchorItem.balance_cents");
    expect(src).toContain("not a mutation of");
  });

  it("only carries forward active older payment arrangements", () => {
    const src = source("lib/monthlyInvoice/monthlyInvoiceAccountCollection.ts");
    expect(src).toContain('.eq("payment_arrangement_active", true)');
    expect(src).toContain('.lt("month", anchorItem.month)');
    expect(src).toContain("if (!promised) continue");
  });

  it("initializes Paystack for statement total and records allocation metadata", () => {
    const src = source("lib/monthlyInvoice/initializePaystackForMonthlyInvoice.ts");
    expect(src).toContain("const balance = collection.collection_total_cents");
    expect(src).toContain("previous_balance_cents");
    expect(src).toContain("collection_invoice_ids");
  });

  it("routes verified monthly payments through statement allocator", () => {
    const src = source("lib/booking/routePaystackChargeForMonthlyInvoice.ts");
    expect(src).toContain("applyMonthlyInvoiceAccountPayment");
  });

  it("mirrors a combined receipt to one Zoho customer payment", () => {
    const src = source("lib/zoho/markZohoInvoiceCollectionPaid.ts");
    expect(src).toContain('"/customerpayments"');
    expect(src).toContain("amount_applied");
    expect(src).toContain("zoho_customer_mismatch");
  });
});
