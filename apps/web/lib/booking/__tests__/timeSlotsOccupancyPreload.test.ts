import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression: `/api/booking/time-slots` used to call getEligibleCleaners ~23 times
 * per date, each re-querying the same day's occupying bookings — multi-second
 * "Checking available times…" on Step 2.
 */
describe("time-slot occupancy preload", () => {
  const root = process.cwd();

  it("getAvailableTimeSlots preloads occupying bookings and preferences once", () => {
    const src = readFileSync(join(root, "lib/booking/availabilityEngine.ts"), "utf8");
    expect(src).toContain("fetchOccupyingBookingsForDate");
    expect(src).toContain("fetchCleanerPreferencesByCleanerIds");
    expect(src).toContain("preloadedOccupyingBookings");
    expect(src).toContain("preloadedCleanerPreferences");
    expect(src).toContain("softDayFulfillmentFromPreloadedPool");
    expect(src).not.toMatch(/countOpsAssignableCleaners\s*\(/);
  });

  it("getEligibleCleaners skips bookings query when preloadedOccupyingBookings is set", () => {
    const src = readFileSync(join(root, "lib/booking/getEligibleCleaners.ts"), "utf8");
    expect(src).toContain("needBookings = params.preloadedOccupyingBookings == null");
    expect(src).toContain("preloadedOccupyingBookings");
  });
});
