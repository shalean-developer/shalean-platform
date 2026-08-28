import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "lib/admin/payments/loadPaymentReconciliation.ts"),
  "utf8",
);

describe("SR-08D manual/offline payment reconciliation", () => {
  it("loads the whole canonical payment ledger instead of Paystack rows only", () => {
    expect(source).toContain('.from("payment_transactions")');
    expect(source).not.toContain('.eq("gateway", "paystack")');
  });

  it("keeps fee and source-reference validation Paystack-specific", () => {
    expect(source).toContain('const isPaystack = tx.gateway === "paystack"');
    expect(source).toContain("if (isPaystack) {");
    expect(source).toContain("resolveSourceReference");
    expect(source).toContain("isPaystack && (tx.processing_fee_cents ?? 0) > 0");
  });

  it("does not falsely flag a partial manual invoice settlement against cumulative invoice paid amount", () => {
    expect(source).toContain(
      "isPaystack ? sourceAmount !== tx.amount_cents : tx.amount_cents > sourceAmount",
    );
  });
});
