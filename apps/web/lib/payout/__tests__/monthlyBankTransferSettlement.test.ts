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
    expect(src).toContain("p_reference: reference");
  });

  it("blocks bank settlement while Paystack is active and closes linked earning rails/run atomically", () => {
    const sql = read("../../supabase/migrations/20261004113000_atomic_bank_transfer_settlement.sql");
    expect(sql).toContain("paystack_transfer_in_flight");
    expect(sql).toContain("public.payout_transfers");
    expect(sql).toContain("payout_run_id = coalesce(b.payout_run_id, v_booking_run_id)");
    expect(sql).toContain("payout_paid_at = v_paid_at");
    expect(sql).toContain("bank_details_missing");
    expect(sql).toContain("public.cleaner_payment_details");
    expect(sql).toContain("linked_earning_no_longer_payable");
    expect(sql).toContain("refunded_at is not null");
    expect(sql).toContain("refund_workflow");
    expect(sql).toContain("jsonb_array_elements");
    expect(sql).toContain("'pending', 'submitted_to_provider'");
    expect(sql).toContain("future_paid_at_not_allowed");
    expect(sql).toContain("perform b.id");
    expect(sql).toContain("for update of b");
    expect(sql).toContain("public.cleaner_payout_runs");
    expect(sql).toContain("status = 'paid'");
  });

  it("serializes refund claims and retries against paid cleaner payouts", () => {
    const sql = read("../../supabase/migrations/20261004113000_atomic_bank_transfer_settlement.sql");
    const refund = read("lib/booking/refund/refundBookingPayment.ts");
    expect(sql).toContain("claim_booking_refund_workflow");
    expect(sql).toContain("booking_payout_already_paid");
    expect(sql).toContain("stale_refund_claim");
    expect(sql).toContain("refund_claim_already_in_flight");
    expect(sql).toContain("invalid_refund_claim_transition");
    expect(sql).toContain("p_expected_booking_snapshot");
    expect(sql).toContain("p_expected_provider_state");
    expect(sql).toContain("for update;");
    expect(sql).toContain("public.booking_roster_member_payouts");
    expect(sql).toContain("public.team_job_member_payouts");
    expect(refund).toContain('admin.rpc("claim_booking_refund_workflow"');
    expect(refund).toContain("p_expected_booking_snapshot: expectedSnapshot");
    expect(refund).toContain("p_refund_id: refundId");
    expect(refund).toContain("p_expected_provider_state: expectedProviderState");
    expect(refund).toContain('"failed"');
    expect(refund).toContain("refund_claim_conflict");
  });

  it("uses Johannesburg business dates and rejects future payment dates", () => {
    const mark = read("lib/payout/markPayoutPaid.ts");
    const panel = read("components/admin/office/OfficePayoutDetailPanel.tsx");
    expect(mark).toContain('timeZone: "Africa/Johannesburg"');
    expect(mark).toContain("Payment date cannot be in the future.");
    expect(panel).toContain('timeZone: "Africa/Johannesburg"');
  });

  it("supports system-prepared monthly batches and idempotent matching bank retries", () => {
    const src = read("lib/payout/markPayoutPaid.ts");
    expect(src).toContain('preparedBy || "system"');
    expect(src).toContain("isMatchingBankReplay");
    expect(src).toContain('"settle_cleaner_payout_bank_transfer"');
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
    expect(src).toContain("bankDetailsUnchanged");
    expect(src).toContain("existing?.recipient_code?.trim() || null");
    expect(src).toContain("If the bank account changed, never carry a recipient tied to the old account forward.");
    expect(src).toContain("paystackWarning");
  });

  it("approves using bank account readiness instead of requiring recipient_code", () => {
    const src = read("lib/payout/approvePayout.ts");
    expect(src).toContain('"account_number, bank_code, account_name"');
    expect(src).not.toContain('select("recipient_code")');
  });

  it("treats saved bank details as cleaner payout-ready even without a Paystack recipient", () => {
    const profile = read("app/api/cleaner/profile-summary/route.ts");
    const earnings = read("app/api/cleaner/earnings/route.ts");
    expect(profile).toContain('String(pr?.account_number ?? "").trim()');
    expect(profile).toContain('String(pr?.bank_code ?? "").trim()');
    expect(earnings).toContain("paystackReady");
    expect(earnings).toContain('account_number, bank_code, account_name, recipient_code');
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
