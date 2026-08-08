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

describe("P3 Paystack refund webhook convergence", () => {
  it("routes successful provider refunds across all finance entity types", () => {
    const src = read("apps/web/lib/payments/routePaystackRefundEvent.ts");
    expect(src).toContain('entityType: "booking"');
    expect(src).toContain('entityType: "monthly_invoice"');
    expect(src).toContain('entityType: "sales_document"');
    expect(src).toContain('from("monthly_invoice_paystack_charge_dedup")');
    expect(src).toContain('from("sales_document_paystack_charge_dedup")');
    expect(src).toContain("recordGatewayRefund");
  });

  it("wires the authoritative webhook to the shared refund router", () => {
    const route = read("apps/web/app/api/paystack/webhook/route.ts");
    expect(route).toContain("routeSuccessfulPaystackRefund");
    expect(route).toContain('providerState === "succeeded"');
    expect(route).toContain("refund.unified_route_failed");
  });

  it("keeps provider refund routing idempotent through one canonical reversal writer", () => {
    const src = read("apps/web/lib/payments/routePaystackRefundEvent.ts");
    expect(src.match(/recordGatewayRefund\(/g)?.length).toBe(1);
    expect(src).toContain("recordAndNotify");
  });

  it("sends refund confirmation through notification idempotency for webhook and direct refund paths", () => {
    const notification = read("apps/web/lib/notifications/sendRefundConfirmationEmail.ts");
    expect(notification).toContain("tryClaimNotificationIdempotency");
    expect(notification).toContain('eventType: "refund_succeeded"');
    expect(notification).toContain("releaseNotificationIdempotencyClaim");
    expect(notification).toContain("safeResendSend");
    expect(notification).toContain("refund:${refundReference}");

    expect(read("apps/web/lib/booking/refund/recordGatewayRefund.ts")).toContain("notifyBookingRefund");
    expect(read("apps/web/lib/monthlyInvoice/refundMonthlyInvoicePayment.ts")).toContain("sendRefundConfirmationEmail");
    expect(read("apps/web/lib/salesDocument/refundSalesDocumentPayment.ts")).toContain("sendRefundConfirmationEmail");
  });

  it("allows refund records through the existing accounting retry queue at the database boundary", () => {
    const sql = read("supabase/migrations/20260809002000_allow_refund_accounting_sync_entity.sql");
    expect(sql).toContain("accounting_sync_records_entity_type_check");
    expect(sql).toContain("'payment_transaction'::text");
    expect(sql).toContain("'refund'::text");
  });

  it("preserves already-paid cleaner payout history during monthly invoice refunds", () => {
    const src = read("apps/web/lib/monthlyInvoice/refundMonthlyInvoicePayment.ts");
    expect(src).toContain('if (ps === "paid")');
    expect(src).toContain('payment_status: "pending_monthly", amount_paid_cents: 0');
    expect(src).toContain('payout_status: "pending"');
    expect(src).toContain("payout_frozen_cents: null");
    expect(src).toContain("balance_cents: total");
  });

  it("fails closed before mutating a sales document when Paystack amount differs from invoice total", () => {
    const src = read("apps/web/lib/salesDocument/applySalesDocumentPayment.ts");
    const mismatch = src.indexOf("if (paidIn !== total)");
    const dedup = src.indexOf('from("sales_document_paystack_charge_dedup")');
    const paidUpdate = src.indexOf('status: "paid"');
    expect(mismatch).toBeGreaterThan(-1);
    expect(dedup).toBeGreaterThan(mismatch);
    expect(paidUpdate).toBeGreaterThan(mismatch);
    expect(src).toContain("sales_document.payment_amount_mismatch");
  });
});
