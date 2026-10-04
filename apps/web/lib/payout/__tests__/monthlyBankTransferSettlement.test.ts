import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("PAYOUT-E2E-002 monthly bank-transfer settlement contract", () => {
  it("records bank transfer as an explicit paid settlement with reference and actor", () => {
    const src = read("lib/payout/markPayoutPaid.ts");
    expect(src).toContain('"bank_transfer"');
    expect(src).toContain("payment_method: method");
    expect(src).toContain("payment_reference: reference || null");
    expect(src).toContain("paid_by: actor");
    expect(src).toContain("mark_bookings_paid_for_cleaner_payout");
  });

  it("has a dedicated bank-transfer API that requires a reference", () => {
    const src = read("app/api/admin/payouts/[id]/bank-transfer/route.ts");
    expect(src).toContain('"payout.release"');
    expect(src).toContain("Bank transfer reference is required.");
    expect(src).toContain('paymentMethod: "bank_transfer"');
  });

  it("keeps Paystack optional while stamping Paystack settlement truth", () => {
    const pay = read("lib/payout/paystackPayout.ts");
    const webhook = read("lib/payout/paystackTransferStatus.ts");
    expect(pay).toContain('payment_method: "paystack"');
    expect(webhook).toContain('payment_method: "paystack"');
  });

  it("runs monthly closeout in generate then freeze then create-run order", () => {
    const setup = read("scripts/print-setup-supabase-crons.sql.mjs");
    const generate = setup.indexOf('["generate-payouts", "0 6 * * 1"');
    const freeze = setup.indexOf('["freeze-payouts", "0 7 * * 1"');
    const create = setup.indexOf('["create-payout-run", "0 8 * * 1"');
    expect(generate).toBeGreaterThan(-1);
    expect(freeze).toBeGreaterThan(generate);
    expect(create).toBeGreaterThan(freeze);
  });
});
