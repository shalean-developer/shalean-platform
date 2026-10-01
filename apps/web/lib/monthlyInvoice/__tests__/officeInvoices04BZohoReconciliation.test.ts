import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("OFFICE-INVOICES-04B Zoho reconciliation safety", () => {
  it("polls Zoho and persists observed accounting state without mutating the invoice", () => {
    const src = readFileSync(
      join(root, "lib/monthlyInvoice/assessMonthlyInvoiceZohoReconciliation.ts"),
      "utf8",
    );

    expect(src).toContain("getZohoInvoice");
    expect(src).toContain("upsertInvoiceSyncMetadata");
    expect(src).toContain('"local_draft_zoho_non_draft"');
    expect(src).toContain('"payment_state_mismatch"');
    expect(src).not.toContain("markZohoInvoicePaid");
    expect(src).not.toContain("voidZohoInvoice");
  });

  it("blocks normal draft sync when Zoho is in a conflicting state", () => {
    const src = readFileSync(
      join(root, "app/api/admin/invoices/[invoiceId]/sync-zoho/route.ts"),
      "utf8",
    );

    expect(src).toContain("assessMonthlyInvoiceZohoReconciliation");
    expect(src).toContain('"zoho_reconciliation_required"');
    expect(src).toContain("status: 409");
  });

  it("exposes an explicit admin reconciliation check", () => {
    const route = readFileSync(
      join(root, "app/api/admin/invoices/[invoiceId]/zoho-reconciliation/route.ts"),
      "utf8",
    );
    const ui = readFileSync(
      join(root, "components/admin/invoices/AdminInvoiceDetailsView.tsx"),
      "utf8",
    );

    expect(route).toContain("requireAdminApi");
    expect(route).toContain("assessMonthlyInvoiceZohoReconciliation");
    expect(ui).toContain("Check Zoho status");
    expect(ui).toContain("Zoho reconciliation required.");
    expect(ui).toContain("Resolve the Zoho payment/status first");
  });
});
