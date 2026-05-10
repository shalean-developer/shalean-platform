import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static guard: cleaner lifecycle REST routes vs `bookingOperations` gateway.
 */
describe("cleaner lifecycle mutation convergence (static guard)", () => {
  const cleanerApi = join(process.cwd(), "app/api/cleaner");

  it("bookings accept uses cleanerAcceptBooking", () => {
    const src = readFileSync(join(cleanerApi, "bookings/[id]/accept/route.ts"), "utf8");
    expect(src).toContain("cleanerAcceptBooking");
    expect(src).not.toContain("runCleanerBookingLifecycleAction");
  });

  it("bookings complete uses markBookingCompleted", () => {
    const src = readFileSync(join(cleanerApi, "bookings/[id]/complete/route.ts"), "utf8");
    expect(src).toContain("markBookingCompleted");
  });

  it("bookings en-route uses markCleanerOnTheWay (not runCleanerBookingLifecycleAction in route)", () => {
    const enRoute = readFileSync(join(cleanerApi, "bookings/[id]/en-route/route.ts"), "utf8");
    expect(enRoute).toContain("markCleanerOnTheWay");
    expect(enRoute).not.toContain("runCleanerBookingLifecycleAction");
  });

  it("bookings start uses markBookingStarted (not runCleanerBookingLifecycleAction in route)", () => {
    const start = readFileSync(join(cleanerApi, "bookings/[id]/start/route.ts"), "utf8");
    expect(start).toContain("markBookingStarted");
    expect(start).not.toContain("runCleanerBookingLifecycleAction");
  });

  it("jobs on-the-way REST alias is en_route (not start); may still call runCleanerBookingLifecycleAction until aligned with en-route gateway", () => {
    const onTheWay = readFileSync(join(cleanerApi, "jobs/[id]/on-the-way/route.ts"), "utf8");
    expect(onTheWay).toContain("en_route");
    expect(onTheWay).not.toContain("markBookingStarted");
  });

  it("POST jobs/[id] uses gateway ops for accept, en_route, start, reject, and complete", () => {
    const src = readFileSync(join(cleanerApi, "jobs/[id]/route.ts"), "utf8");
    expect(src).toContain("cleanerAcceptBooking");
    expect(src).toContain('action === "accept"');
    expect(src).toContain("markCleanerOnTheWay");
    expect(src).toContain('action === "en_route"');
    expect(src).toContain("markBookingStarted");
    expect(src).toContain('action === "start"');
    expect(src).toContain("cleanerRejectBooking");
    expect(src).toContain('action === "reject"');
    expect(src).toContain("markBookingCompleted");
    expect(src).toContain('action === "complete"');
  });

  it("POST jobs/[id] keeps runCleanerBookingLifecycleAction only as an exhaustive fallback", () => {
    const src = readFileSync(join(cleanerApi, "jobs/[id]/route.ts"), "utf8");
    expect(src).toContain("runCleanerBookingLifecycleAction");
  });

  it("/api/cleaner/respond uses cleanerAcceptBooking and cleanerRejectBooking (no direct runCleanerBookingLifecycleAction)", () => {
    const src = readFileSync(join(cleanerApi, "respond/route.ts"), "utf8");
    expect(src).toContain("cleanerAcceptBooking");
    expect(src).toContain("cleanerRejectBooking");
    expect(src).toContain('action === "reject"');
    expect(src).not.toContain("runCleanerBookingLifecycleAction");
  });

  it("/api/cleaner/respond does not use jobs idempotency table", () => {
    const src = readFileSync(join(cleanerApi, "respond/route.ts"), "utf8");
    expect(src).not.toContain("cleaner_job_lifecycle_idempotency");
  });
});
