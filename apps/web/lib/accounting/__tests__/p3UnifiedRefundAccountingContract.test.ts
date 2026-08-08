import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(HERE, "..", "..", "..");
const REPO_ROOT = path.resolve(WEB_ROOT, "..", "..");

function read(rel: string): string {
  return readFileSync(path.join(REPO_ROOT, rel), "utf8");
}

describe("P3 unified refund accounting contract", () => {
  it("creates a first-class refund ledger with unique idempotency key", () => {
    const sql = read("supabase/migrations/20260808223000_unified_refund_accounting.sql");
    expect(sql).toContain("create table if not exists public.refund_accounting_records");
    expect(sql).toContain("refund_key text not null unique");
    expect(sql).toContain("payment_transaction_id uuid references public.payment_transactions");
    expect(sql).toContain("zoho_credit_note_id text");
    expect(sql).toContain("accounting_status text not null default 'pending'");
  });

  it("routes refund accounting through the existing retry queue", () => {
    const queue = read("apps/web/lib/accounting/accountingSyncQueue.ts");
    const processor = read("apps/web/lib/accounting/processAccountingSyncQueue.ts");
    expect(queue).toMatch(/\|\s*"refund"/);
    expect(processor).toContain('case "refund":');
    expect(processor).toContain("syncRefundCreditNoteToZoho(admin, record.entity_id)");
  });

  it("makes gateway refund retries converge on the unified ledger", () => {
    const gateway = read("apps/web/lib/booking/refund/recordGatewayRefund.ts");
    expect(gateway).toContain("recordUnifiedRefundAccounting");
    expect(gateway).toContain("ensureUnifiedAccounting");
    const existingBranch = gateway.indexOf("if (existing?.id)");
    const ensureAfterExisting = gateway.indexOf("ensureUnifiedAccounting", existingBranch);
    expect(existingBranch).toBeGreaterThan(-1);
    expect(ensureAfterExisting).toBeGreaterThan(existingBranch);
  });

  it("records invoice refund ledgers before marking local invoices refunded", () => {
    for (const file of [
      "apps/web/lib/monthlyInvoice/refundMonthlyInvoicePayment.ts",
      "apps/web/lib/salesDocument/refundSalesDocumentPayment.ts",
    ]) {
      const src = read(file);
      const ledger = src.lastIndexOf("const ledger = await recordRefundLedger");
      const refundedUpdate = src.lastIndexOf('status: "refunded"');
      expect(ledger, file).toBeGreaterThan(-1);
      expect(refundedUpdate, file).toBeGreaterThan(ledger);
    }
  });

  it("creates Zoho credit notes asynchronously and stores the external identity", () => {
    const sync = read("apps/web/lib/accounting/syncRefundCreditNoteToZoho.ts");
    expect(sync).toContain("/creditnotes?invoice_id=");
    expect(sync).toContain("zoho_credit_note_id: creditNoteId");
    expect(sync).toContain('accounting_status: "failed"');
    expect(sync).toContain('accounting_status: "synced"');
  });
});
