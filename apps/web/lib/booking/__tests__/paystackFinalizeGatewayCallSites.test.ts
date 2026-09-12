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
