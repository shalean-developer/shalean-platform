import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Stage 03 sales invoice enrollment safety", () => {
  const source = readFileSync(resolve(process.cwd(), "lib/salesDocument/syncSalesDocumentToZoho.ts"), "utf8");
  const retrySource = readFileSync(resolve(process.cwd(), "lib/admin/billing/syncBillingDocumentToZoho.ts"), "utf8");
  const migration = readFileSync(resolve(process.cwd(), "../../supabase/migrations/20261021204500_enroll_sales_invoice_sync_metadata.sql"), "utf8");
  it("enrolls linked invoice metadata without overwriting earlier sync status", () => {
    expect(source).toContain('if (invoiceId)');
    expect(source).toContain('entity_type: "sales_document"');
    expect(source).toContain('ignoreDuplicates: true');
    expect(source).toContain('zoho_invoice_status_enrollment_failed');
  });
  it("retries enrollment for already linked invoices without recreating Zoho invoices", () => {
    expect(retrySource).toContain('if (existing) {');
    expect(retrySource).toContain('if (!isQuote) {');
    expect(retrySource).toContain('entity_type: "sales_document"');
    expect(retrySource).toContain('ignoreDuplicates: true');
    expect(retrySource).toContain('zoho_invoice_status_enrollment_failed');
  });
  it("recovers missing metadata for already linked monthly invoices", () => {
    expect(retrySource).toContain('entity_type: "monthly_invoice"');
    expect(retrySource).toContain('entity_id: invoiceId');
    expect(retrySource).toContain('ignoreDuplicates: true');
    const monthlyMigration = readFileSync(resolve(process.cwd(), "../../supabase/migrations/20261021210000_enroll_monthly_invoice_sync_metadata.sql"), "utf8");
    expect(monthlyMigration).toContain("from public.monthly_invoices mi");
    expect(monthlyMigration).toContain("on conflict (entity_type, entity_id) do nothing");
  });
  it("backfills only missing links, never money or existing sync rows", () => {
    expect(migration).toContain("where sd.document_type = 'invoice'");
    expect(migration).toContain("on conflict (entity_type, entity_id) do nothing");
    expect(migration).not.toMatch(/\bupdate\s+(?:public\.)?(?:monthly_invoices|bookings|payment_transactions|cleaner_payouts)\b/i);
  });
});
