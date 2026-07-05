import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Visibility guard: documents which admin booking mutation routes delegate through `bookingOperations`.
 * Update this file when migrating additional paths (intentionally non-blocking documentation).
 */
describe("admin booking mutation convergence (static guard)", () => {
  const apiRoot = join(process.cwd(), "app/api/admin/bookings");

  it("assign-team POST uses adminAssignTeamToBooking (not performAdminAssignTeam)", () => {
    const src = readFileSync(join(apiRoot, "[id]/assign-team/route.ts"), "utf8");
    expect(src).toContain("adminAssignTeamToBooking");
    expect(src).not.toMatch(/\bperformAdminAssignTeam\s*\(/);
  });

  it("retry-dispatch POST uses retryDispatchBooking (no inline ensureBookingAssignment in route)", () => {
    const src = readFileSync(join(apiRoot, "[id]/retry-dispatch/route.ts"), "utf8");
    expect(src).toContain("retryDispatchBooking");
    expect(src).not.toContain("ensureBookingAssignment");
  });

  it("cleaner POST bookings/[id]/accept is retired (410) with jobs API successor", () => {
    const cleanerRoot = join(process.cwd(), "app/api/cleaner/bookings");
    const src = readFileSync(join(cleanerRoot, "[id]/accept/route.ts"), "utf8");
    expect(src).toContain("retiredCleanerBookingRoute");
    expect(src).not.toContain("cleanerAcceptBooking");
  });

  it("assign POST uses adminAssignCleanerToBooking (not performAdminAssignToCleaner)", () => {
    const src = readFileSync(join(apiRoot, "[id]/assign/route.ts"), "utf8");
    expect(src).toContain("adminAssignCleanerToBooking");
    expect(src).not.toMatch(/\bperformAdminAssignToCleaner\s*\(/);
  });

  it("reassign POST remains an alias of assign (thin re-export)", () => {
    const src = readFileSync(join(apiRoot, "[id]/reassign/route.ts"), "utf8");
    expect(src).toContain("../assign/route");
  });

  it("assign-smart POST uses adminSmartAssignBooking (not runAdminAssignSmart)", () => {
    const src = readFileSync(join(apiRoot, "[id]/assign-smart/route.ts"), "utf8");
    expect(src).toContain("adminSmartAssignBooking");
    expect(src).not.toMatch(/\brunAdminAssignSmart\s*\(/);
  });

  it("mark-paid POST uses adminMarkBookingPaidOperation (delegates manual settlement)", () => {
    const src = readFileSync(join(apiRoot, "[id]/mark-paid/route.ts"), "utf8");
    expect(src).toContain("adminMarkBookingPaidOperation");
    expect(src).not.toMatch(/\badminMarkBookingPaid\s*\(/);
    expect(src).not.toMatch(/\badminRecordBookingDeposit\s*\(/);
    expect(src).not.toContain("finalizePaidBooking");
    expect(src).not.toContain("routeBookingNotificationEvent");
  });

  it("lists high-risk admin routes not yet migrated to bookingOperations (documentation)", () => {
    const notMigrated = ["[id]/route.ts"];
    for (const rel of notMigrated) {
      const src = readFileSync(join(apiRoot, rel), "utf8");
      expect(src).not.toContain("adminAssignTeamToBooking");
      expect(src).not.toContain("retryDispatchBooking");
      expect(src).not.toContain("adminAssignCleanerToBooking");
      expect(src).not.toContain("adminSmartAssignBooking");
    }
  });

  it("edit-details PATCH routes notes-only through adminUpdateBookingNotes and repricing through adminRepriceBooking", () => {
    const src = readFileSync(join(apiRoot, "[id]/edit-details/route.ts"), "utf8");
    expect(src).toContain("adminUpdateBookingNotes");
    expect(src).toContain("isAdminEditBookingDetailsNotesOnlyBody");
    expect(src).toContain("adminRepriceBooking");
    expect(src).not.toMatch(/\badminEditBookingDetails\s*\(/);
    expect(src).not.toContain("finalizePaidBooking");
    expect(src).toMatch(/notesOnly\s*\?[\s\S]*adminUpdateBookingNotes/);
    expect(src).toMatch(/:\s*await\s+adminRepriceBooking\(/);
  });
});
