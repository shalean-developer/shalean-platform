import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Recurring occurrence insertion + payment_state refresh convergence (static guards).
 *
 * Migrated:
 * - Per-booking recurring insertion gateway (`generateRecurringOccurrenceBooking`)
 * - Monthly recurring insertion gateway (`generateMonthlyRecurringOccurrenceBooking`)
 * - Recurring `payment_state` projection refresh (`refreshRecurringBookingPaymentState`, cron generate + charge + backfill)
 *
 * Not migrated:
 * - Recurring plan cursor ownership (still in generate cron)
 * - charge-recurring cron payment/charge logic
 * - Monthly invoice settlement / manual mark-paid
 * - Payout logic
 * - Recurring cancellation/skip/backfill management routes (insert gateways only; backfill uses same gateways as cron)
 */
describe("recurring occurrence insertion convergence (static guard)", () => {
  const cwd = process.cwd();

  it("generate-recurring-bookings cron uses bookingOperations insertion wrappers, not direct insert helpers", () => {
    const src = readFileSync(join(cwd, "app/api/cron/generate-recurring-bookings/route.ts"), "utf8");
    expect(src).toContain("generateRecurringOccurrenceBooking");
    expect(src).toContain("generateMonthlyRecurringOccurrenceBooking");
    expect(src).not.toContain("insertRecurringOccurrenceBooking");
    expect(src).not.toContain("insertMonthlyRecurringOccurrenceBooking");
  });

  it("generate cron still owns cursor advancement (next_run_date / last_generated_at / skip clear)", () => {
    const src = readFileSync(join(cwd, "app/api/cron/generate-recurring-bookings/route.ts"), "utf8");
    expect(src).toContain("next_run_date");
    expect(src).toContain("last_generated_at");
    expect(src).toContain("skip_next_occurrence_date");
    expect(src).toContain(".from(\"recurring_bookings\")");
  });

  it("generate cron still calls refreshRecurringBookingPaymentState after successful insert", () => {
    const src = readFileSync(join(cwd, "app/api/cron/generate-recurring-bookings/route.ts"), "utf8");
    expect(src).toContain("refreshRecurringBookingPaymentState");
  });

  it("insert helpers preserve per-booking vs monthly billing shapes (status / prefix)", () => {
    const per = readFileSync(join(cwd, "lib/recurring/insertRecurringOccurrenceBooking.ts"), "utf8");
    expect(per).toContain("status: \"pending_payment\"");
    expect(per).toContain("payment_status: \"pending\"");
    expect(per).toContain("`rec_${crypto.randomUUID()}`");

    const monthly = readFileSync(join(cwd, "lib/recurring/insertMonthlyRecurringOccurrenceBooking.ts"), "utf8");
    expect(monthly).toContain("status: \"pending\"");
    expect(monthly).toContain("payment_status: \"pending_monthly\"");
    expect(monthly).toContain("billing_type: \"recurring_invoice\"");
    expect(monthly).toContain("`mi_bkg_${crypto.randomUUID()}`");
  });

  it("occurrence insertion wrappers do not call payment_state refresh or notification router", () => {
    const src = readFileSync(join(cwd, "lib/booking/bookingOperations.ts"), "utf8");
    const start = src.indexOf("export async function generateRecurringOccurrenceBooking");
    const end = src.indexOf("export type CleanerLifecycleOperationArgs");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const slice = src.slice(start, end);
    expect(slice).not.toContain("refreshRecurringBookingPaymentState");
    expect(slice).not.toContain("refreshRecurringPaymentStateForBooking");
    expect(slice).not.toContain("routeBookingNotificationEvent");
  });

  it("backfill uses bookingOperations insertion gateways (same as generate cron)", () => {
    const src = readFileSync(join(cwd, "lib/recurring/backfillRecurringOccurrencesToToday.ts"), "utf8");
    expect(src).toContain("generateRecurringOccurrenceBooking");
    expect(src).toContain("generateMonthlyRecurringOccurrenceBooking");
    expect(src).toContain("@/lib/booking/bookingOperations");
    expect(src).not.toContain("insertRecurringOccurrenceBooking");
    expect(src).not.toContain("insertMonthlyRecurringOccurrenceBooking");
  });
});
