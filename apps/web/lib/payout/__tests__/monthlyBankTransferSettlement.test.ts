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

  it("makes bank transfer the visible run settlement path and keeps Paystack opt-in", () => {
    const list = read("components/admin/payout-runs/AdminDisbursementRunsPanel.tsx");
    const detail = read("app/admin/payouts/runs/[id]/page.tsx");
    const process = read("lib/payout/runs/processPayoutRun.ts");

    expect(list).toContain("record bank transfers per cleaner");
    expect(list).not.toContain(">Paystack<");
    expect(list).not.toContain("Manual paid");
    expect(detail).toContain("Monthly bank-transfer run");
    expect(detail).toContain("/bank-transfer");
    expect(detail).toContain("Bank reference");
    expect(detail).toContain("Bank transfer date");
    expect(detail).toContain("paid_at:");
    expect(detail).toContain("T12:00:00+02:00");
    expect(detail).toContain("Record paid");
    expect(detail.indexOf('payment_status ?? "").toLowerCase() === "processing"')).toBeLessThan(
      detail.indexOf('p.status === "approved"'),
    );
    expect(detail).not.toContain("Send Paystack");
    expect(detail).not.toContain("Mark paid (manual)");
    expect(process).toContain("ENABLE_CLEANER_PAYSTACK_PAYOUTS");
    expect(process).toContain("Cleaner Paystack payouts are disabled.");
    expect(process).toContain('const mode = opts.mode ?? "manual"');
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

  it("mutually excludes refund claims and Paystack payout submission", () => {
    const sql = read("../../supabase/migrations/20261004113000_atomic_bank_transfer_settlement.sql");
    const pay = read("lib/payout/paystackPayout.ts");
    expect(sql).toContain("claim_cleaner_payout_paystack_processing");
    expect(sql).toContain("linked_refund_or_ineligible_booking_blocks_payout");
    expect(sql).toContain("p_allow_existing_processing");
    expect(sql).toContain("payout_cleaner_mismatch");
    expect(sql).toContain("payout_has_no_earning_items");
    expect(sql).toContain("payout_amount_not_positive");
    expect(sql).toContain("payout_total_mismatch");
    expect(sql).toContain("'partial', 'full', 'reversed', 'chargeback'");
    expect(sql).toContain("b.is_test is true");
    expect(sql).toContain("payment_status, '')) = 'processing'");
    expect(sql).toContain("public.payout_transfers");
    expect(pay).toContain('admin.rpc("claim_cleaner_payout_paystack_processing"');
    expect(pay).toContain("p_allow_existing_processing: true");
    expect(pay).toContain("p_allow_existing_processing: false");
    expect(pay).toContain("Payout resume is blocked because a linked booking is refunded");
    expect(pay).toContain("loadAndValidatePayoutBatch");
    expect(pay).toContain("const resumeBatch = await loadAndValidatePayoutBatch");
    expect(pay).toContain("Payout contains earning items for a different cleaner.");
    expect(pay).toContain("Payout total does not match linked booking totals.");
  });

  it("gates cron/outbox cleaner payout sends before every provider POST", () => {
    const executor = read("lib/payout/paystackTransferExecutor.ts");
    expect(executor).toContain("validateCleanerPayoutBeforeProviderPost");
    expect(executor).toContain('admin.rpc("claim_cleaner_payout_paystack_processing"');
    expect(executor).toContain("loadCleanerPayoutBatchItems");
    expect(executor).toContain("Blocked Paystack transfer before provider POST");
    expect(executor).toContain("const safetyGate = await validateCleanerPayoutBeforeProviderPost");
  });

  it("terminally fails permanently invalid cleaner-payout outboxes", () => {
    const executor = read("lib/payout/paystackTransferExecutor.ts");
    expect(executor).toContain("permanent_pre_provider_validation_failure");
    expect(executor).toContain('admin.rpc("fail_cleaner_payout_outbox_validation"');
    expect(executor).toContain("permanentValidationFailure");
    expect(executor).toContain("permanentBusinessRule ? 409 : 500");
    expect(executor).toContain("needsReconcile: true");
    expect(executor).toContain("leaving it retryable");
    expect(executor).toContain('error: terminalErr.message || "Could not converge blocked payout outbox."');
    expect(executor).toContain("needsReconcile: true");
    expect(executor).toContain("Temporarily blocked Paystack transfer before provider POST");
    const sql = read("../../supabase/migrations/20261004113000_atomic_bank_transfer_settlement.sql");
    expect(sql).toContain("fail_cleaner_payout_outbox_validation");
    expect(sql).toContain("outbox_not_safe_for_terminal_failure");
    expect(sql).toContain("p_expected_status");
    expect(sql).toContain("p_expected_attempts");
    expect(sql).toContain("'sending'");
    expect(sql).toContain("coalesce(v_outbox.attempts, 0) <> p_expected_attempts");
    expect(sql).toContain("transfer_audit_not_converged");
    expect(sql).toContain("payout_not_converged");
  });

  it("keeps transient resume validation retryable and fails deterministic resume rejection", () => {
    const pay = read("lib/payout/paystackPayout.ts");
    expect(pay).toContain("if (resumeBatch.status >= 500)");
    expect(pay).toContain("needsReconcile: true");
    expect(pay).toContain("if (resumed.needsReconcile) return resumed");
    expect(pay).toContain("await failPayoutExecution(admin, payout.id)");
  });

  it("makes processing-payout resume convergence outbox-aware", () => {
    const pay = read("lib/payout/paystackPayout.ts");
    const recipient = read("lib/payout/ensurePaystackRecipient.ts");
    expect(pay).toContain("convergeDeterministicResumeFailure");
    expect(pay).toContain("Existing Paystack transfer requires reconciliation");
    expect(pay).toContain('admin.rpc("fail_cleaner_payout_outbox_validation"');
    expect(pay).toContain("deterministicResumeBlock");
    expect(pay).toContain("ensuredResume.retryable");
    expect(pay).toContain("if (!failed.ok)");
    expect(recipient).toContain("res.status === 429");
    expect(recipient).toContain("res.status === 408");
    expect(recipient).toContain("retryable: true");
    expect(recipient).toContain("retryable: false");
  });

  it("uses an exclusive sending lease so terminal convergence cannot race a sender", () => {
    const executor = read("lib/payout/paystackTransferExecutor.ts");
    const pay = read("lib/payout/paystackPayout.ts");
    const sql = read("../../supabase/migrations/20261004113000_atomic_bank_transfer_settlement.sql");
    expect(executor).toContain("const expectedAttempts = outbox.attempts ?? 0");
    expect(executor).toContain('status: "sending"');
    expect(executor).toContain('.eq("status", "pending")');
    expect(executor).toContain('.eq("attempts", expectedAttempts)');
    expect(executor).toContain("Exclusive sender lease");
    expect(executor).toContain('p_expected_status: "sending"');
    expect(executor).toContain("15 * 60 * 1000");
    expect(sql).toContain("'pending', 'sending', 'submitted'");
    expect(pay).toContain('outboxStatus === "failed"');
    expect(pay).toContain('outboxStatus === "pending"');
  });

  it("keeps transient outbox lease-claim errors reconcilable", () => {
    const executor = read("lib/payout/paystackTransferExecutor.ts");
    expect(executor).toContain("if (claimErr)");
    expect(executor).toContain("error: claimErr.message");
    expect(executor).toContain("status: 500");
    expect(executor).toContain("needsReconcile: true");
  });

  it("converges recovered sending leases before retiring the outbox", () => {
    const executor = read("lib/payout/paystackTransferExecutor.ts");
    expect(executor).toContain('from "@/lib/payout/paystackTransferStatus"');
    expect(executor).toContain("applyTransferSuccess");
    expect(executor).toContain("applyTransferFailed");
    expect(executor).toContain("Recovered Paystack transfer could not update audit row");
    expect(executor).toContain("await applyTransferSuccess(admin");
    expect(executor).toContain("Recovered outbox lease changed before submission convergence.");
    expect(executor).toContain("const released = await releaseOutboxSendLease");
    expect(executor).toContain("if (!released.ok)");
    expect(executor).toContain("Outbox lease changed before release.");
  });

  it("replays incomplete downstream convergence after transfer audit success", () => {
    const status = read("lib/payout/paystackTransferStatus.ts");
    const executor = read("lib/payout/paystackTransferExecutor.ts");
    expect(status).toContain("A successful audit row may still have incomplete downstream reconciliation");
    expect(status).toContain('if (transfer.status !== "success")');
    expect(executor).toContain("await applyTransferSuccess(admin");
    expect(executor).toContain("Existing successful transfer reconciliation failed.");
  });

  it("routes existing successful payout retries through full convergence", () => {
    const pay = read("lib/payout/paystackPayout.ts");
    expect(pay).toContain('import { applyTransferSuccess } from "@/lib/payout/paystackTransferStatus"');
    expect(pay).toContain("await applyTransferSuccess(admin");
    expect(pay).toContain("Successful payout transfer is missing transfer_code.");
    expect(pay).toContain("Successful payout reconciliation failed.");
    expect(pay).toContain('payment_reference: transferCode');
    expect(pay).not.toContain('await admin.rpc("mark_bookings_paid_for_cleaner_payout", { p_payout_id: payout.id });');
  });

  it("keeps successful payout convergence retryable after payout becomes paid", () => {
    const status = read("lib/payout/paystackTransferStatus.ts");
    const pay = read("lib/payout/paystackPayout.ts");
    expect(status).toContain('payment_reference: transferCode');
    expect(status).toContain('if (referenceErr) throw new Error(referenceErr.message)');
    expect(status).toContain('if (error) throw new Error(error.message)');
    expect(pay.indexOf("existingSuccess")).toBeLessThan(pay.indexOf('payout.status !== "approved"'));
  });

  it("isolates verified success convergence errors per outbox row", () => {
    const executor = read("lib/payout/paystackTransferExecutor.ts");

    expect(executor).toContain("Verified transfer success convergence failed.");
    expect(executor).toContain("needsReconcile: true");
    expect(executor).toContain("await applyTransferSuccess(admin");
  });

  it("isolates verified failure convergence errors per outbox row", () => {
    const executor = read("lib/payout/paystackTransferExecutor.ts");

    expect(executor).toContain("Verified transfer failure convergence failed.");
    expect(executor).toContain("needsReconcile: true");
    expect(executor).toContain("try {");
    expect(executor).toContain("await applyTransferFailed(admin");
  });

  it("retires verified terminal-failure outboxes by id and immutable reference", () => {
    const executor = read("lib/payout/paystackTransferExecutor.ts");

    expect(executor).toContain("retireFailedErr");
    expect(executor).toContain('.eq("id", outbox.id)');
    expect(executor).toContain('.eq("reference", params.reference)');
    expect(executor).toContain('status: "failed"');
    expect(executor).toContain("transfer_code: verified.transferCode");
  });

  it("applies verified provider outcomes before retiring reconciliation outboxes", () => {
    const executor = read("lib/payout/paystackTransferExecutor.ts");

    expect(executor).toContain("applyTransferFailed, applyTransferSuccess");
    expect(executor).toContain("providerSucceeded");
    expect(executor).toContain("providerFailed");
    expect(executor).toContain("await applyTransferSuccess(admin");
    expect(executor).toContain("await applyTransferFailed(admin");
    expect(executor).toContain('status: "submitted"');
    expect(executor).toContain('status: "processing"');
  });

  it("routes pending payout intents with provider history into reconciliation, not cancellation", () => {
    const executor = read("lib/payout/paystackTransferExecutor.ts");

    expect(executor).toContain("transfer_code");
    expect(executor).toContain('status: "needs_reconcile"');
    expect(executor).toContain("await submitPaystackTransferViaOutbox");
    expect(executor).toContain("if (outbox.status === \"succeeded\")");
    expect(executor).not.toContain('outbox.status === "succeeded" || outbox.transfer_code');
  });

  it("hides bank settlement for partial Paystack failures", () => {
    const detail = read("app/admin/payouts/runs/[id]/page.tsx");

    expect(detail).toContain('payment_status ?? "").toLowerCase() === "partial_failed"');
    expect(detail).toContain("Transfer requires reconciliation");
    expect(detail.indexOf('payment_status ?? "").toLowerCase() === "partial_failed"')).toBeLessThan(
      detail.indexOf('p.status === "approved"'),
    );
  });

  it("converges disabled pending cleaner payouts into a bank-transfer-safe state", () => {
    const executor = read("lib/payout/paystackTransferExecutor.ts");

    expect(executor).toContain("cleanerPaystackEnabled");
    expect(executor).toContain('r.rail === "cleaner_payout" && r.status === "pending"');
    expect(executor).toContain('admin.rpc("fail_cleaner_payout_outbox_validation"');
    expect(executor).toContain('p_expected_status: "pending"');
    expect(executor).toContain("definitely-unsent intent to terminal failed");
    expect(executor).toContain("use bank-transfer settlement");
  });

  it("preserves pre-deploy duplicate/reference uncertainty on failed no-code outboxes", () => {
    const executor = read("lib/payout/paystackTransferExecutor.ts");

    expect(executor).toContain("failedOutboxHasProviderUncertainty");
    expect(executor).toContain('/duplicate|already|reference/i.test(String(outbox?.last_error ?? ""))');
    expect(executor).toContain('status: "needs_reconcile"');
  });

  it("rotates unresolved reconciliation rows using updated_at fairness", () => {
    const executor = read("lib/payout/paystackTransferExecutor.ts");

    expect(executor).toContain('.order("updated_at", { ascending: true })');
    expect(executor).toContain("Provider verification unresolved.");
    expect(executor).toContain("updated_at: new Date().toISOString()");
  });

  it("keeps unresolved duplicate/reference responses out of terminal failed state", () => {
    const executor = read("lib/payout/paystackTransferExecutor.ts");

    expect(executor).toContain("Duplicate/reference rejection means Paystack may already own the immutable");
    expect(executor).toContain('status: "needs_reconcile"');
    expect(executor).toContain("Paystack reference may already exist; transfer left for reconciliation.");
    expect(executor).toContain("verification unresolved");
  });

  it("reconciles coded failed cleaner-payout retries before disabled cancellation", () => {
    const executor = read("lib/payout/paystackTransferExecutor.ts");

    expect(executor).toContain('outbox.status === "failed"');
    expect(executor).toContain('String(outbox.transfer_code ?? "").trim()');
    expect(executor).toContain('status: "needs_reconcile"');
    expect(executor).toContain("return submitPaystackTransferViaOutbox(admin, params)");
    expect(executor).toContain("A retained transfer_code means the intent is not definitely unsent.");
  });

  it("atomically cancels disabled fresh cleaner payout intents before provider POST", () => {
    const executor = read("lib/payout/paystackTransferExecutor.ts");

    expect(executor).toContain('admin.rpc("fail_cleaner_payout_outbox_validation"');
    expect(executor).toContain('p_expected_status: "sending"');
    expect(executor).toContain("p_expected_attempts: outbox.attempts");
    expect(executor).toContain("Fresh transfer intent was cancelled before provider submission");
    expect(executor.indexOf("fail_cleaner_payout_outbox_validation")).toBeLessThan(
      executor.indexOf("const transfer = await paystackPostTransfer"),
    );
  });

  it("enforces cleaner Paystack opt-in at the final provider POST boundary", () => {
    const executor = read("lib/payout/paystackTransferExecutor.ts");

    expect(executor).toContain("the final money-send boundary");
    expect(executor).toContain('params.rail === "cleaner_payout"');
    expect(executor).toContain("ENABLE_CLEANER_PAYSTACK_PAYOUTS");
    expect(executor).toContain("await releaseOutboxSendLease");
    expect(executor.indexOf("ENABLE_CLEANER_PAYSTACK_PAYOUTS")).toBeLessThan(
      executor.indexOf("const transfer = await paystackPostTransfer"),
    );
    expect(executor.indexOf("Already submitted — resume / verify")).toBeLessThan(
      executor.indexOf("the final money-send boundary"),
    );
  });

  it("lets existing Paystack intents reach executor reconciliation before opt-in enforcement", () => {
    const pay = read("lib/payout/paystackPayout.ts");
    const executor = read("lib/payout/paystackTransferExecutor.ts");

    expect(pay).not.toContain("ENABLE_CLEANER_PAYSTACK_PAYOUTS");
    expect(pay).toContain("submitPaystackTransferViaOutbox");
    expect(executor).toContain("ENABLE_CLEANER_PAYSTACK_PAYOUTS");
    expect(executor.indexOf("Already submitted — resume / verify")).toBeLessThan(
      executor.indexOf("the final money-send boundary"),
    );

    const directPayRoute = read("app/api/admin/payouts/[id]/pay/route.ts");
    const retryRoute = read("app/api/admin/payouts/runs/[id]/retry/route.ts");
    expect(directPayRoute).toContain("payCleanerPayoutWithPaystack");
    expect(retryRoute).toContain("payCleanerPayoutWithPaystack");
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
