import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("BOOKING-E2E-09B terminal payment expiration convergence", () => {
  it("canonical helper guards unpaid pending state before terminal transition", () => {
    const src = read("lib/booking/expirePendingPaymentTerminal.ts");
    expect(src).toContain('.eq("status", "pending_payment")');
    expect(src).toContain('.is("payment_completed_at", null)');
    expect(src).toContain('status: "payment_expired"');
    expect(src).toContain('dispatch_status: "unassigned"');
    expect(src).toContain("releaseCleaningCreditForBooking");
    expect(src).toContain("cancelUnsentBookingPaymentRecoveryJobs");
  });

  it("cron terminal expiry uses the canonical side-effect boundary", () => {
    const src = read("app/api/cron/expire-pending-payments/route.ts");
    expect(src).toContain("expirePendingPaymentTerminal(admin");
    expect(src).not.toContain("releaseCleaningCreditForBooking(admin, id)");
    expect(src).not.toContain('.update({ status: "payment_expired"');
  });

  it("recoverable payment-session refresh remains separate from terminal expiry", () => {
    const src = read("lib/booking/ensureBookingPaymentSession.ts");
    expect(src).toContain('status === "payment_expired"');
    expect(src).toContain("initializeFreshPaystackSession");
    expect(src).not.toContain("expirePendingPaymentTerminal");
  });
});
