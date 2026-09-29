import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function read(relative: string) {
  return fs.readFileSync(path.join(process.cwd(), relative), "utf8");
}

describe("INV-E2E-02A non-actionable payment sync quarantine", () => {
  const queueSource = read("lib/accounting/accountingSyncQueue.ts");
  const processorSource = read("lib/accounting/processAccountingSyncQueue.ts");
  const paymentSource = read("lib/payments/recordGatewayPayment.ts");
  const migrationSource = read(
    "../../supabase/migrations/20260929102500_inv_e2e_02a_ignore_nonactionable_payment_sync.sql",
  );

  it("treats ignored queue rows as terminal instead of re-enqueuing them", () => {
    expect(queueSource).toContain('existing?.sync_status === "ignored"');
    expect(queueSource).toContain("markSyncIgnored");
    expect(queueSource).toContain('sync_status: "ignored"');
  });

  it("never sends per-visit payment work for test, monthly-owned, or sales-document-owned bookings", () => {
    for (const reason of [
      "booking_test",
      "booking_monthly_owned",
      "booking_sales_document_owned",
    ]) {
      expect(paymentSource).toContain(reason);
      expect(processorSource).toContain(reason);
    }
    expect(paymentSource).toContain("paymentAccountingApplicability");
    expect(processorSource).toContain("ignoredReason");
  });

  it("adds ignored as an explicit database state and quarantines only structural booking exceptions", () => {
    expect(migrationSource).toContain("'ignored'::text");
    expect(migrationSource).toContain("b.is_test");
    expect(migrationSource).toContain("b.is_monthly_billing_booking");
    expect(migrationSource).toContain("b.sales_document_id is not null");
    expect(migrationSource).toContain("r.sync_status in ('pending','failed','not_synced')");
  });

  it("does not classify linked normal bookings, monthly invoices, or sales documents as ignored", () => {
    expect(migrationSource).not.toContain("zoho_invoice_id is not null");
    expect(migrationSource).not.toContain("entity_type = 'monthly_invoice'");
    expect(migrationSource).not.toContain("entity_type = 'sales_document'");
  });
});
