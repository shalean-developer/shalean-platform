import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("BOOKING-E2E-14B.1 R0 post-payment operational convergence", () => {
  it("runs R0 post-payment operations only after authoritative zero-cash settlement", () => {
    const src = read("app/api/booking-v2/confirm/route.ts");
    const settlePos = src.indexOf("await settleFullyCoveredBooking(supabase, { bookingId, payAmountZar })");
    const opsPos = src.indexOf("await finalizeR0BookingPostPayment(supabase, bookingId)", settlePos);

    expect(settlePos).toBeGreaterThanOrEqual(0);
    expect(opsPos).toBeGreaterThan(settlePos);
    expect(src).toContain("Payment is already authoritatively settled");
  });

  it("reuses canonical post-payment dispatch, team, roster and lifecycle boundaries", () => {
    const src = read("lib/booking/finalizeR0BookingPostPayment.ts");

    expect(src).toContain("scheduleBookingLifecycleJobs");
    expect(src).toContain("promoteV2TeamBookingAfterPayment");
    expect(src).toContain("syncPreferredCleanerRosterFromBookingRow");
    expect(src).toContain("startPreferredCleanerDispatchAfterPayment");
    expect(src).toContain("assignBestCleaner");
    expect(src).toContain('source: "booking_v2_r0"');
    expect(src).toContain('.from("dispatch_offers")');
    expect(src).toContain('"preferred_offer_already_exists"');
  });

  it("does not re-settle money or invent cash inside the operational helper", () => {
    const src = read("lib/booking/finalizeR0BookingPostPayment.ts");

    expect(src).not.toContain("settleCleaningCreditForBooking");
    expect(src).not.toContain("settleFullyCoveredBooking");
    expect(src).not.toContain("amount_paid_cents:");
    expect(src).not.toContain("total_paid_zar:");
    expect(src).not.toContain("payment_status:");
  });

  it("keeps a distinct assignment source for R0 observability", () => {
    const src = read("lib/dispatch/ensureBookingAssignment.ts");
    expect(src).toContain('| "booking_v2_r0"');
  });
});
