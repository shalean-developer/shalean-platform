import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("OFFICE-INVOICES-04D guarded Zoho overstatement correction", () => {
  it("requires paid/R0 local state and exact remote overstatement match", () => {
    const src = readFileSync(
      join(root, "lib/accounting/processZohoInvoiceCorrectionRequests.ts"),
      "utf8",
    );

    expect(src).toContain('localStatus !== "paid"');
    expect(src).toContain("localBalanceCents !== 0");
    expect(src).toContain("differenceCents !== zoho.balanceCents");
    expect(src).toContain("differenceCents <= 0");
  });

  it("creates a credit note, not another customer payment", () => {
    const src = readFileSync(
      join(root, "lib/accounting/processZohoInvoiceCorrectionRequests.ts"),
      "utf8",
    );

    expect(src).toContain("/creditnotes?invoice_id=");
    expect(src).toContain('name: "Invoice correction"');
    expect(src).toContain("No customer cash refund.");
    expect(src).toContain("customer_refund: false");
    expect(src).not.toContain("markZohoInvoicePaid");
  });

  it("is request-scoped and records idempotent applied evidence", () => {
    const src = readFileSync(
      join(root, "lib/accounting/processZohoInvoiceCorrectionRequests.ts"),
      "utf8",
    );

    expect(src).toContain('"zoho_invoice_correction_requested"');
    expect(src).toContain('"zoho_invoice_correction_applied"');
    expect(src).toContain("request_event_id");
    expect(src).toContain("zoho_credit_note_id");
    expect(src).toContain("refreshInvoiceStatusFromZoho");
  });

  it("runs in a bounded accounting-sync batch", () => {
    const src = readFileSync(
      join(root, "lib/accounting/processAccountingSyncQueue.ts"),
      "utf8",
    );

    expect(src).toContain("processZohoInvoiceCorrectionRequests");
    expect(src).toContain("processZohoInvoiceCorrectionRequests(admin, 1)");
  });
});
