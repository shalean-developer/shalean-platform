import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Consolidation guard: production Paystack finalize paths route through {@link finalizePaidBooking}.
 * (Full HTTP webhook tests are not required here.)
 */
describe("Paystack finalize gateway call sites", () => {
  const root = process.cwd();

  it("webhook route uses finalizePaidBooking and not finalizePaystackChargeSuccess(", () => {
    const src = readFileSync(join(root, "app/api/paystack/webhook/route.ts"), "utf8");
    expect(src).toContain("finalizePaidBooking");
    expect(src).toContain("upsertResultFromFinalizePaidBookingOp");
    expect(src).not.toMatch(/\bfinalizePaystackChargeSuccess\s*\(/);
  });

  it("paystack verify route delegates finalization through runPaystackVerifyFinalizePipeline (no direct finalizePaystackChargeSuccess)", () => {
    const src = readFileSync(join(root, "app/api/paystack/verify/route.ts"), "utf8");
    expect(src).toContain("runPaystackVerifyFinalizePipeline");
    expect(src).not.toMatch(/\bfinalizePaystackChargeSuccess\s*\(/);
  });

  it("retry-failed-jobs cron uses finalizePaidBooking", () => {
    const src = readFileSync(join(root, "app/api/cron/retry-failed-jobs/route.ts"), "utf8");
    expect(src).toContain("finalizePaidBooking");
    expect(src).not.toMatch(/\bfinalizePaystackChargeSuccess\s*\(/);
  });

  it("payment reconciliation retries preserve gateway data and record settlement before deletion", () => {
    const retry = readFileSync(join(root, "app/api/cron/retry-failed-jobs/route.ts"), "utf8");
    const verifyPipeline = readFileSync(join(root, "lib/booking/runPaystackVerifyFinalizePipeline.ts"), "utf8");
    const webhook = readFileSync(join(root, "app/api/paystack/webhook/route.ts"), "utf8");

    expect(verifyPipeline).toContain("paystackAuthorizationCode: authorizationCode || null");
    expect(verifyPipeline).toContain("paystackCustomerCode: customerCode || null");
    expect(verifyPipeline).toContain('paidAtIso: typeof tx.paid_at === "string" ? tx.paid_at : null');
    expect(verifyPipeline).toContain("paystackChargeData: paystackChargeDataFromRecord");

    expect(webhook).toContain("paystackAuthorizationCode:");
    expect(webhook).toContain("paystackCustomerCode:");
    expect(webhook).toContain("paystackChargeData: paystackChargeDataFromRecord");

    expect(retry).toContain("payload.paystackAuthorizationCode");
    expect(retry).toContain("payload.paystackCustomerCode");
    expect(retry).toContain("payload.paidAtIso");
    expect(retry).toContain('jobType === FAILED_JOB_TYPE_PAYMENT_RECONCILIATION');
    expect(retry).toContain("const paymentPersisted = await recordPaystackBookingPayment");
    expect(retry).toContain("if (!paymentPersisted.ok)");
    expect(retry).toContain("continue;");
    expect(retry).toContain("await recordPaystackBookingPayment");
    const reconciliationBlock = retry.slice(
      retry.indexOf("if (result.bookingId && !result.error)"),
      retry.indexOf("} else {", retry.indexOf("if (result.bookingId && !result.error)")),
    );
    expect(reconciliationBlock.indexOf("await recordPaystackBookingPayment")).toBeGreaterThan(-1);
    expect(reconciliationBlock.indexOf("await recordPaystackBookingPayment")).toBeLessThan(
      reconciliationBlock.indexOf('from("failed_jobs").delete().eq("id", id)'),
    );
  });

  it("legacy payments/verify is a 410 tombstone and cannot finalize bookings", () => {
    const src = readFileSync(join(root, "app/api/payments/verify/route.ts"), "utf8");
    expect(src).toContain("LEGACY_PAYMENTS_VERIFY_RETIRED");
    expect(src).toContain("status: 410");
    expect(src).toContain("/api/paystack/verify");
    expect(src).not.toContain("runPaystackVerifyFinalizePipeline");
    expect(src).not.toContain("finalizePaidBooking");
    expect(src).not.toContain("fetchPaystackTransactionVerify");
  });

  it("shared runPaystackVerifyFinalizePipeline calls finalizePaidBooking", () => {
    const src = readFileSync(join(root, "lib/booking/runPaystackVerifyFinalizePipeline.ts"), "utf8");
    expect(src).toContain("finalizePaidBooking");
    expect(src).not.toMatch(/\bfinalizePaystackChargeSuccess\s*\(/);
  });

  it("verify pipeline does not await Zoho side effects (success-page hang guard)", () => {
    const src = readFileSync(join(root, "lib/booking/runPaystackVerifyFinalizePipeline.ts"), "utf8");
    expect(src).toMatch(/void\s+syncPaidBookingSideEffects\s*\(/);
    expect(src).not.toMatch(/await\s+syncPaidBookingSideEffects\s*\(/);
  });

  it("verify callback defers non-critical work until after the confirmation response", () => {
    const pipeline = readFileSync(join(root, "lib/booking/runPaystackVerifyFinalizePipeline.ts"), "utf8");
    const finalize = readFileSync(join(root, "lib/booking/finalizePaystackChargeSuccess.ts"), "utf8");
    const upsert = readFileSync(join(root, "lib/booking/upsertBookingFromPaystack.ts"), "utf8");

    expect(pipeline).toContain('deferNonCriticalSideEffects: opsLogSource === "paystack/verify"');
    expect(finalize).toContain("deferPostPersistSideEffects: params.deferNonCriticalSideEffects");
    expect(finalize).toMatch(/after\(async \(\) => \{/);
    expect(upsert).toContain("deferPostPersistSideEffects?: boolean");
    expect(upsert).toMatch(/if \(input\.deferPostPersistSideEffects\) \{\s*after\(async \(\) => \{/);
  });

  it("webhook does not await Zoho side effects (Paystack retry hang guard)", () => {
    const src = readFileSync(join(root, "app/api/paystack/webhook/route.ts"), "utf8");
    expect(src).toMatch(/void\s+syncPaidBookingSideEffects\s*\(/);
    expect(src).not.toMatch(/await\s+syncPaidBookingSideEffects\s*\(/);
  });

  it("admin mark-paid route does not call finalizePaidBooking (manual settlement wrapper)", () => {
    const src = readFileSync(join(root, "app/api/admin/bookings/[id]/mark-paid/route.ts"), "utf8");
    expect(src).not.toContain("finalizePaidBooking");
    expect(src).toContain("adminMarkBookingPaidOperation");
  });

  it("bookingOperations delegates to finalizePaystackChargeSuccess but does not import notifyBookingEvent", () => {
    const src = readFileSync(join(root, "lib/booking/bookingOperations.ts"), "utf8");
    expect(src).toContain("finalizePaystackChargeSuccess");
    expect(src).not.toContain("notifyBookingEvent");
  });

  /**
   * Fix 1 — `bookingPayableForWeeklyBatch` (prepaid path) requires `payment_status='success'`.
   * `upsertBookingFromPaystack` must write it for non-monthly Paystack rows; monthly rows
   * keep their own lifecycle (`pending_monthly` → `success` via `applyMonthlyInvoicePayment`).
   */
  it("upsertBookingFromPaystack writes payment_status='success' guarded by monthly detection", () => {
    const src = readFileSync(join(root, "lib/booking/upsertBookingFromPaystack.ts"), "utf8");
    expect(src).toContain("detectMonthlyManagedRowForPaystackFinalize");
    expect(src).toContain("paystackFinalizePaymentStatus");
    expect(src).toMatch(/payment_status:\s*"success"/);
    expect(src).toMatch(/billing_type, is_monthly_billing_booking, monthly_invoice_id, payment_status/);
  });
});
