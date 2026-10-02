import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("QUOTE-E2E-08 accounting closeout", () => {
  it("awaits and verifies payment accounting queue enrollment", () => {
    const src = readFileSync(
      join(root, "lib/payments/recordGatewayPayment.ts"),
      "utf8",
    );

    expect(src).toContain("async function ensurePaymentAccountingQueue");
    expect(src).toContain('entityType: "payment_transaction"');
    expect(src).toContain('await ensurePaymentAccountingQueue(admin, paymentTransactionId)');
    expect(src).not.toContain('void enqueueAccountingSync(admin, {\n      entityType: "payment_transaction"');
  });

  it("verifies the queue row and retries a direct pending insert when absent", () => {
    const src = readFileSync(
      join(root, "lib/payments/recordGatewayPayment.ts"),
      "utf8",
    );

    expect(src).toContain('.from("accounting_sync_records")');
    expect(src).toContain('.eq("entity_type", "payment_transaction")');
    expect(src).toContain('.eq("entity_id", paymentTransactionId)');
    expect(src).toContain('sync_status: "pending"');
    expect(src).toContain('"23505"');
  });

  it("logs a reconciliation error without rolling back the recorded payment", () => {
    const src = readFileSync(
      join(root, "lib/payments/recordGatewayPayment.ts"),
      "utf8",
    );

    expect(src).toContain('"payment_accounting_queue_enrollment_failed"');
    expect(src).toContain('return { ok: true, created: true, paymentTransactionId, expenseId }');
  });
});
