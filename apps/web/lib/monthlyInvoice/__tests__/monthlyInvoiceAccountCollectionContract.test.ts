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
  it("sends Paystack statement receipts to Clearing without altering allocations", () => {
    const src = source("lib/zoho/markZohoInvoiceCollectionPaid.ts");
    expect(src).toContain("account_id: zohoPaystackClearingAccountId()");
    expect(src).toContain("amount_applied: x.amountZar");
  });

  it("identifies confirmed Paystack receipts explicitly across payment paths", () => {
    const zoho = source("lib/zoho/zohoBooksService.ts");
    const sales = source("lib/salesDocument/applySalesDocumentPayment.ts");
    const monthly = source("lib/monthlyInvoice/applyMonthlyInvoicePayment.ts");
    const queue = source("lib/accounting/processAccountingSyncQueue.ts");
    const booking = source("lib/booking/syncPaidBookingSideEffects.ts");
    expect(zoho).toContain('paymentSource?: "paystack"');
    expect(zoho).toContain('params.paymentSource === "paystack"');
    expect(sales).toContain('paymentSource: "paystack"');
    expect(monthly).toContain('paymentSource: "paystack"');
    expect(queue).toContain('pt.gateway === "paystack"');
    expect(booking).toContain('paymentMethod === "paystack"');
  });

  it("preserves the FNB fallback for direct payments and allows staging Clearing overrides", () => {
    const src = source("lib/zoho/zohoWebsiteReceiptAccount.ts");
    const client = source("lib/zoho/zohoBooksClient.ts");
    expect(src).toContain("ZOHO_PAYSTACK_CLEARING_ACCOUNT_ID");
    expect(src).toContain("253016000000482521");
    expect(src).toContain("253016000000097002");
    expect(client).toContain("if (explicit) return body");
  });

  it("routes only verified Paystack-linked fee expenses through Clearing", () => {
    const src = source("lib/accounting/syncExpenseToZoho.ts");
    const zoho = source("lib/zoho/zohoBooksService.ts");
    expect(src).toContain("payment_transactions!expenses_payment_transaction_id_fkey ( gateway_reference, gateway )");
    expect(src).toContain('categoryName === "Paystack Fees" && row.payment_transactions?.gateway === "paystack"');
    expect(src).toContain("paidThroughAccountId: zohoPaystackClearingAccountId()");
    expect(zoho).toContain("paid_through_account_id: params.paidThroughAccountId");
  });

  it("does not route manual sales document payments to Clearing", () => {
    const manual = source("lib/salesDocument/markSalesDocumentPaidManual.ts");
    const helper = source("lib/zoho/zohoBooksService.ts");
    expect(manual).not.toContain("paymentSource:");
    expect(helper).toContain('params.paymentSource === "paystack"');
  });

});
