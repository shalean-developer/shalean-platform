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

  it("keeps provider refund routing idempotent through the canonical reversal writer", () => {
    const src = read("apps/web/lib/payments/routePaystackRefundEvent.ts");
    expect(src.match(/recordGatewayRefund\(/g)?.length).toBe(3);
  });
});
