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

  it("legacy payments/verify routes through runPaystackVerifyFinalizePipeline (canonical finalize) without assignCleaner", () => {
    const src = readFileSync(join(root, "app/api/payments/verify/route.ts"), "utf8");
    expect(src).toContain("runPaystackVerifyFinalizePipeline");
    expect(src).not.toMatch(/\bassignCleaner\b/);
    expect(src).not.toContain("payment_status: \"success\"");
    expect(src).not.toContain("notificationRouter");
  });

  it("shared runPaystackVerifyFinalizePipeline calls finalizePaidBooking", () => {
    const src = readFileSync(join(root, "lib/booking/runPaystackVerifyFinalizePipeline.ts"), "utf8");
    expect(src).toContain("finalizePaidBooking");
    expect(src).not.toMatch(/\bfinalizePaystackChargeSuccess\s*\(/);
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
});
