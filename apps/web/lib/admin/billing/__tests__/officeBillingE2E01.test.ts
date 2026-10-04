import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("OFFICE-BILLING-E2E-01 reconciliation integrity", () => {
  it("does not hard-cap billing source queries before reconciliation filtering", () => {
    const src = readFileSync(
      resolve(process.cwd(), "lib/admin/billing/loadAdminBillingDocuments.ts"),
      "utf8",
    );
    expect(src).toContain("fetchAllPages");
    expect(src).not.toContain(".limit(300)");
    expect(src).not.toContain(".limit(200)");
    expect(src).not.toContain("filtered.slice(0, 250)");
  });

  it("returns explicit pagination metadata", () => {
    const src = readFileSync(
      resolve(process.cwd(), "lib/admin/billing/loadAdminBillingDocuments.ts"),
      "utf8",
    );
    expect(src).toContain("total_filtered");
    expect(src).toContain("total_pages");
    expect(src).toContain("page_size");
  });

  it("surfaces loader failures instead of rendering partial accounting data", () => {
    const api = readFileSync(
      resolve(process.cwd(), "app/api/admin/billing-documents/route.ts"),
      "utf8",
    );
    const page = readFileSync(
      resolve(process.cwd(), "app/(ui-redesign)/office/billing/page.tsx"),
      "utf8",
    );
    expect(api).toContain("billing_documents_load_failed");
    expect(page).toContain("Billing data could not be loaded completely.");
  });

  it("never auto-caps a manual monthly Zoho payment", () => {
    const src = readFileSync(
      resolve(process.cwd(), "lib/admin/billing/syncBillingDocumentToZoho.ts"),
      "utf8",
    );
    expect(src).toContain("contactId: zohoInv.customerId ?? undefined");
    expect(src).toContain("zoho_balance_mismatch:");
    expect(src).not.toContain("Math.min(paidCents, zohoInv.balanceCents)");
  });
});
