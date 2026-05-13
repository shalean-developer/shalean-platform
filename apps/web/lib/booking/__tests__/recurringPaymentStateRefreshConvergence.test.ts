import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static guard: recurring payment_state projection refresh routes through bookingOperations.
 *
 * Migrated: recurring `payment_state` projection refresh (cron generate + cron charge + backfill).
 *
 * Occurrence insertion gateways live in {@link recurringOccurrenceInsertionConvergence.test.ts}.
 *
 * Not migrated here: charge-recurring payment/charge logic; admin recurring override;
 * recurring cancel/skip/backfill management; Paystack finalize/upsert path; payout/earnings; admin retry-charge;
 * admin retry-charge still uses direct `refreshRecurringPaymentStateForBooking`.
 */
describe("recurring payment_state refresh convergence (static guard)", () => {
  const cwd = process.cwd();

  it("generate-recurring-bookings cron uses refreshRecurringBookingPaymentState from bookingOperations", () => {
    const src = readFileSync(join(cwd, "app/api/cron/generate-recurring-bookings/route.ts"), "utf8");
    expect(src).toContain("refreshRecurringBookingPaymentState");
    expect(src).toContain("@/lib/booking/bookingOperations");
    expect(src).not.toContain("refreshRecurringPaymentStateForBooking");
  });

  it("charge-recurring-bookings cron uses refreshRecurringBookingPaymentState from bookingOperations", () => {
    const src = readFileSync(join(cwd, "app/api/cron/charge-recurring-bookings/route.ts"), "utf8");
    expect(src).toContain("refreshRecurringBookingPaymentState");
    expect(src).toContain("@/lib/booking/bookingOperations");
    expect(src).not.toContain("refreshRecurringPaymentStateForBooking");
  });

  it("Paystack upsert still calls refreshRecurringPaymentStateForBooking directly (finalize path not migrated)", () => {
    const src = readFileSync(join(cwd, "lib/booking/upsertBookingFromPaystack.ts"), "utf8");
    expect(src).toContain("refreshRecurringPaymentStateForBooking");
    expect(src).not.toContain("refreshRecurringBookingPaymentState");
  });

  it("backfill uses refreshRecurringBookingPaymentState from bookingOperations", () => {
    const src = readFileSync(join(cwd, "lib/recurring/backfillRecurringOccurrencesToToday.ts"), "utf8");
    expect(src).toContain("refreshRecurringBookingPaymentState");
    expect(src).toContain("@/lib/booking/bookingOperations");
    expect(src).not.toContain("refreshRecurringPaymentStateForBooking");
  });

  it("monthly invoice full settlement uses refreshRecurringBookingPaymentState from bookingOperations", () => {
    const helper = readFileSync(join(cwd, "lib/monthlyInvoice/settleMonthlyInvoiceChildren.ts"), "utf8");
    expect(helper).toContain("refreshRecurringBookingPaymentState");
    expect(helper).toContain("@/lib/booking/bookingOperations");
    expect(helper).not.toContain("refreshRecurringPaymentStateForBooking");
    for (const relativePath of [
      "lib/monthlyInvoice/applyMonthlyInvoicePayment.ts",
      "lib/monthlyInvoice/markMonthlyInvoicePaidManual.ts",
    ]) {
      const src = readFileSync(join(cwd, relativePath), "utf8");
      expect(src).toContain("settleMonthlyInvoiceChildren");
      expect(src).not.toContain("refreshRecurringPaymentStateForBooking");
    }
  });

  it("Probe E monthly payment_state drift repair uses refreshRecurringBookingPaymentState from bookingOperations", () => {
    const repair = readFileSync(join(cwd, "lib/monthlyInvoice/repairMonthlyInvoicePaymentStateDriftProbeE.ts"), "utf8");
    expect(repair).toContain("refreshRecurringBookingPaymentState");
    expect(repair).toContain("@/lib/booking/bookingOperations");
    expect(repair).not.toContain("refreshRecurringPaymentStateForBooking");
  });

  it("retry-charge admin route still calls refreshRecurringPaymentStateForBooking directly", () => {
    const src = readFileSync(join(cwd, "app/api/admin/bookings/[id]/retry-charge/route.ts"), "utf8");
    expect(src).toContain("refreshRecurringPaymentStateForBooking");
    expect(src).not.toContain("refreshRecurringBookingPaymentState");
  });
});
