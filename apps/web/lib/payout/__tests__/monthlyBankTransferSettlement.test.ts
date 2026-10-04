import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("PAYOUT-E2E-002 monthly bank-transfer settlement contract", () => {
  it("records bank transfer through one atomic service-role RPC", () => {
    const src = read("lib/payout/markPayoutPaid.ts");
    expect(src).toContain('"bank_transfer"');
    expect(src).toContain('"settle_cleaner_payout_bank_transfer"');
    expect(src).toContain("p_payment_method");
  });

  it("blocks bank settlement while Paystack is active and closes linked earning rails/run atomically", () => {
    const sql = read("../../supabase/migrations/20261004113000_atomic_bank_transfer_settlement.sql");
    expect(sql).toContain("paystack_transfer_in_flight");
    expect(sql).toContain("public.payout_transfers");
    expect(sql).toContain("perform public.mark_bookings_paid_for_cleaner_payout");
    expect(sql).toContain("public.cleaner_payout_runs");
    expect(sql).toContain("status = 'paid'");
  });

  it("has a dedicated bank-transfer API that requires a reference", () => {
    const src = read("app/api/admin/payouts/[id]/bank-transfer/route.ts");
    expect(src).toContain('"payout.release"');
    expect(src).toContain("Bank transfer reference is required.");
    expect(src).toContain('paymentMethod: "bank_transfer"');
  });

  it("persists bank details independently from Paystack recipient creation", () => {
    const src = read("app/api/cleaner/payment-details/route.ts");
    expect(src).toContain("Bank-transfer operation must remain available");
    expect(src).toContain("recipient_code: recipientCode");
    expect(src).toContain("paystackWarning");
  });

  it("approves using bank account readiness instead of requiring recipient_code", () => {
    const src = read("lib/payout/approvePayout.ts");
    expect(src).toContain('"account_number, bank_code, account_name"');
    expect(src).not.toContain('select("recipient_code")');
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
