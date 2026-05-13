import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const cleanerDir = path.resolve(__dirname, "..");
const command = path.join(cleanerDir, "cleanerLifecycleBookingCommands.ts");
const lifecycle = path.join(cleanerDir, "runCleanerBookingLifecycleAction.ts");

const intentionallyUnmigrated = [
  path.resolve(__dirname, "../../dispatch/dispatchOffers.ts"),
  path.resolve(__dirname, "../../booking/upsertBookingFromPaystack.ts"),
  path.resolve(__dirname, "../../booking/adminMarkBookingPaid.ts"),
  path.resolve(__dirname, "../../booking/assignCleaner.ts"),
  path.resolve(__dirname, "../../admin/adminManualBookingOfferCommand.ts"),
  path.resolve(__dirname, "../../admin/adminBookingLifecycleStatusOverrideCommand.ts"),
  path.resolve(__dirname, "../../monthlyInvoice/finalizeDueMonthlyInvoices.ts"),
  path.resolve(__dirname, "../../monthlyInvoice/applyMonthlyInvoicePayment.ts"),
  path.resolve(__dirname, "../../monthlyInvoice/markMonthlyInvoicePaidManual.ts"),
];

describe("cleaner lifecycle booking command convergence (Phase 1G)", () => {
  it("owns the assignable cleaner lifecycle update guard unchanged", () => {
    const src = readFileSync(command, "utf8");

    expect(src).toContain("updateAssignableCleanerLifecycleBookingOrFail");
    expect(src).toContain("isAssignableForCleanerLifecycleStatus");
    expect(src).toMatch(
      /\.from\("bookings"\)[\s\S]*?\.select\("id,status"\)[\s\S]*?\.eq\("id",\s*params\.bookingId\)[\s\S]*?\.maybeSingle\(\)/,
    );
    expect(src).toMatch(
      /\.from\("bookings"\)[\s\S]*?\.update\(params\.patch\)[\s\S]*?\.eq\("id",\s*params\.bookingId\)[\s\S]*?\.select\("id"\)/,
    );
    expect(src).toContain("CLEANER_LIFECYCLE_CODE.BOOKING_STATE_CHANGED");
    expect(src).toContain("CLEANER_LIFECYCLE_CODE.ACCEPT_UPDATE_NO_ROW");
  });

  it("owns the recurring pending-payment lifecycle update shape unchanged", () => {
    const src = readFileSync(command, "utf8");

    expect(src).toContain("updateRecurringPendingPaymentCleanerLifecycleBooking");
    expect(src).toMatch(
      /\.from\("bookings"\)[\s\S]*?\.update\(params\.patch\)[\s\S]*?\.eq\("id",\s*params\.bookingId\)[\s\S]*?\.eq\("status",\s*"pending_payment"\)[\s\S]*?\.select\("id"\)/,
    );
  });

  it("owns the generic cleaner lifecycle booking-state update shape unchanged", () => {
    const src = readFileSync(command, "utf8");

    expect(src).toContain("updateCleanerLifecycleBookingState");
    expect(src).toMatch(
      /\.from\("bookings"\)[\s\S]*?\.update\(params\.patch\)[\s\S]*?\.eq\("id",\s*params\.bookingId\)/,
    );
  });

  it("migrates only runCleanerBookingLifecycleAction booking-state writes", () => {
    const src = readFileSync(lifecycle, "utf8");

    expect(src).toContain("updateAssignableCleanerLifecycleBookingOrFail");
    expect(src).toContain("updateRecurringPendingPaymentCleanerLifecycleBooking");
    expect(src).toContain("updateCleanerLifecycleBookingState");
    expect(src).not.toMatch(/\.from\("bookings"\)[\s\S]{0,160}?\.update\(/);
    expect(src).toMatch(/\.from\("cleaners"\)\.update\(\{ jobs_completed: prev \+ 1 \}\)/);
  });

  it("keeps payout calculation and ledger persistence outside the command wrappers", () => {
    const commandSrc = readFileSync(command, "utf8");
    const lifecycleSrc = readFileSync(lifecycle, "utf8");

    expect(commandSrc).not.toContain("persistCleanerPayoutIfUnset");
    expect(commandSrc).not.toContain("ensureCleanerEarningsLedgerRow");
    expect(commandSrc).not.toContain("fetchBookingDisplayEarningsCents");
    expect(lifecycleSrc).toContain("persistCleanerPayoutIfUnset");
    expect(lifecycleSrc).toContain("ensureCleanerEarningsLedgerRow");
    expect(lifecycleSrc).toContain("fetchBookingDisplayEarningsCents");
  });

  it("preserves payout persistence timing before the completed-state write", () => {
    const src = readFileSync(lifecycle, "utf8");
    const completeBlock = src.indexOf('if (action === "complete")');
    const payoutIdx = src.indexOf("persistCleanerPayoutIfUnset({ admin, bookingId, cleanerId })", completeBlock);
    const updateIdx = src.indexOf("updateCleanerLifecycleBookingState({", payoutIdx);

    expect(completeBlock).toBeGreaterThan(-1);
    expect(payoutIdx).toBeGreaterThan(completeBlock);
    expect(updateIdx).toBeGreaterThan(payoutIdx);
  });

  it("leaves dispatch, payment finalization, admin, assignment, and monthly invoice flows out of Phase 1G", () => {
    for (const p of intentionallyUnmigrated) {
      const src = readFileSync(p, "utf8");
      expect(src, `${path.basename(p)} must not use cleaner lifecycle booking commands`).not.toContain(
        "cleanerLifecycleBookingCommands",
      );
    }
  });
});
