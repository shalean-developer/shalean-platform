import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Stage 03 booking enrollment and monthly error boundary", () => {
  it("retries booking metadata enrollment without treating it as paid", () => {
    const source=readFileSync(resolve(process.cwd(),"lib/admin/billing/syncBillingDocumentToZoho.ts"),"utf8");
    expect(source).toContain('entity_type: "booking"');
    expect(source).toContain('booking_id: bookingId');
    expect(source).toContain('ignoreDuplicates: true');
    expect(source).toContain('zoho_invoice_status_enrollment_failed');
    const sql=readFileSync(resolve(process.cwd(),"../../supabase/migrations/20261021211500_enroll_booking_invoice_sync_metadata.sql"),"utf8");
    expect(sql).toContain("on conflict (entity_type, entity_id) do nothing");
    expect(sql).not.toMatch(/\bupdate\b/i);
  });
  it("monthly Zoho metadata error returns failure instead of escaping",()=>{
    const source=readFileSync(resolve(process.cwd(),"lib/monthlyInvoice/syncMonthlyInvoiceToZohoBooks.ts"),"utf8");
    expect(source).toContain("try {\n  await upsertInvoiceSyncMetadata");
    expect(source).toContain("zoho_metadata_enrollment_failed");
  });
});
