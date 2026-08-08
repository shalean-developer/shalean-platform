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

  it("sends refund confirmation through notification idempotency, not raw webhook count", () => {
    const src = read("apps/web/lib/notifications/sendRefundConfirmationEmail.ts");
    expect(src).toContain("tryClaimNotificationIdempotency");
    expect(src).toContain('eventType: "refund_succeeded"');
    expect(src).toContain("releaseNotificationIdempotencyClaim");
    expect(src).toContain("safeResendSend");
    expect(src).toContain("refund:${refundReference}");
  });
});
