import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("payment ledger/accounting ordering", () => {
  it("links the booking to the payment transaction before optional accounting work", () => {
    const src = read("lib/payments/recordGatewayPayment.ts");
    const helperStart = src.indexOf("const completeSideEffects = async");
    const bookingLink = src.indexOf(".update({ payment_transaction_id: paymentTransactionId })", helperStart);
    const feePrereq = src.indexOf("paystack_fee_expense_prerequisites_missing", helperStart);
    const accountingQueue = src.indexOf("paymentAccountingApplicability", helperStart);

    expect(helperStart).toBeGreaterThanOrEqual(0);
    expect(bookingLink).toBeGreaterThan(helperStart);
    expect(feePrereq).toBeGreaterThan(bookingLink);
    expect(accountingQueue).toBeGreaterThan(bookingLink);
  });

  it("seeds the canonical Paystack fee category and account idempotently", () => {
    const sql = read("../../supabase/migrations/20261010203500_payment_accounting_paystack_prerequisites.sql");

    expect(sql).toContain("('Technology', 'Paystack Fees', true, true)");
    expect(sql).toContain("('Paystack Balance', 'paystack', true, 0, 'not_synced'");
    expect(sql).toContain("on conflict (group_name, name) do update");
    expect(sql).toContain("on conflict (name) do update");
  });
});
