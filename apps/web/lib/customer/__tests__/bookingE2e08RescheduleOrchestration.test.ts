import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("BOOKING-E2E-08 reschedule orchestration ownership", () => {
  it("keeps the authoritative mutation handler free of redispatch ownership", () => {
    const handler = read("lib/customer/customerBookingModifyHandlers.ts");
    expect(handler).not.toContain('ensureBookingAssignment(auth.admin, bookingId, { source: "customer_reschedule" })');
    expect(handler).not.toContain('from "@/lib/dispatch/ensureBookingAssignment"');
  });

  it("makes the orchestrator the single reschedule redispatch owner", () => {
    const orchestrator = read("lib/customer/orchestrateCustomerBookingReschedule.ts");
    expect(orchestrator).toContain("expirePendingDispatchOffersForBooking(admin, bookingId)");
    expect(orchestrator).toContain('from("dispatch_retry_queue")');
    expect(orchestrator).toContain('ensureBookingAssignment(admin, bookingId, { source: "customer_reschedule" })');

    const offerPos = orchestrator.indexOf("expirePendingDispatchOffersForBooking(admin, bookingId)");
    const retryPos = orchestrator.indexOf('from("dispatch_retry_queue")');
    const redispatchPos = orchestrator.indexOf('ensureBookingAssignment(admin, bookingId, { source: "customer_reschedule" })');
    expect(offerPos).toBeGreaterThanOrEqual(0);
    expect(retryPos).toBeGreaterThan(offerPos);
    expect(redispatchPos).toBeGreaterThan(retryPos);
  });

  it("route orchestrates only after the authoritative reschedule succeeds", () => {
    const route = read("app/api/customer/bookings/[id]/reschedule/route.ts");
    const mutatePos = route.indexOf("handleCustomerBookingReschedule(auth, bookingId, body)");
    const okGuardPos = route.indexOf("if (!response.ok) return response;");
    const orchestratePos = route.indexOf("orchestrateCustomerBookingReschedule(auth.admin, bookingId)");
    expect(mutatePos).toBeGreaterThanOrEqual(0);
    expect(okGuardPos).toBeGreaterThan(mutatePos);
    expect(orchestratePos).toBeGreaterThan(okGuardPos);
  });
});
