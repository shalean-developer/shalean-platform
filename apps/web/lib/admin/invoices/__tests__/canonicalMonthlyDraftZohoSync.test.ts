import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("canonical monthly draft to Zoho sync", () => {
  it("selects only billable unlinked monthly drafts", () => {
    const src = readFileSync(
      join(root, "lib/admin/invoices/syncMissingMonthlyDraftsToZoho.ts"),
      "utf8",
    );

    expect(src).toContain('.eq("status", "draft")');
    expect(src).toContain('.is("zoho_invoice_id", null)');
    expect(src).toContain('.gt("total_amount_cents", 0)');
  });

  it("uses the existing canonical Meegan-style draft sync path", () => {
    const src = readFileSync(
      join(root, "lib/admin/invoices/syncMissingMonthlyDraftsToZoho.ts"),
      "utf8",
    );

    expect(src).toContain("syncDraftMonthlyInvoiceToZohoAfterRecompute");
    expect(src).toContain("zoho_invoice_id");
    expect(src).toContain("zoho_invoice_number");
  });

  it("does not send, finalize, or mark invoices paid", () => {
    const src = readFileSync(
      join(root, "lib/admin/invoices/syncMissingMonthlyDraftsToZoho.ts"),
      "utf8",
    );

    expect(src).not.toContain("finalizeAndSendMonthlyInvoice");
    expect(src).not.toContain("sendMonthlyInvoiceEmail");
    expect(src).not.toContain("markMonthlyInvoicePaidManual");
    expect(src).not.toContain("markZohoInvoiceSent");
    expect(src).not.toContain("markZohoInvoicePaid");
    expect(src).toContain("customer_email_sent: false");
    expect(src).toContain("finalized: false");
    expect(src).toContain("marked_paid: false");
  });

  it("requires dry-run then explicit apply confirmation", () => {
    const route = readFileSync(
      join(root, "app/api/admin/invoices/sync-missing-zoho-drafts/route.ts"),
      "utf8",
    );

    expect(route).toContain('syncMissingMonthlyDraftsToZoho(admin, "dry_run")');
    expect(route).toContain('"SYNC_MISSING_ZOHO_DRAFTS"');
    expect(route).toContain('syncMissingMonthlyDraftsToZoho(admin, "apply")');
  });

  it("exposes Sync Zoho drafts in the invoice registry with no-email copy", () => {
    const page = readFileSync(
      join(root, "app/(ui-redesign)/office/invoices/page.tsx"),
      "utf8",
    );

    expect(page).toContain("Sync Zoho drafts");
    expect(page).toContain("No customer email will be sent.");
    expect(page).toContain("Nothing will be marked paid or finalized.");
    expect(page).toContain("/api/admin/invoices/sync-missing-zoho-drafts");
  });
});
