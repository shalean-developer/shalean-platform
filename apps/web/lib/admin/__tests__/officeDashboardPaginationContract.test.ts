import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static contract: ops-snapshot and schedule/day must page instead of hard truncating.
 */
describe("ops-snapshot route pagination contract", () => {
  it("pages open bookings and exposes truncated + scannedOpenBookings", () => {
    const src = readFileSync(join(process.cwd(), "app/api/admin/ops-snapshot/route.ts"), "utf8");
    expect(src).toContain("PAGE_SIZE");
    expect(src).toContain(".range(from, to)");
    expect(src).not.toMatch(/\.limit\(\s*3500\s*\)/);
    expect(src).toContain("scannedOpenBookings");
    expect(src).toContain("truncated");
    expect(src).toContain("payment_expired");
  });
});

describe("schedule/day route pagination contract", () => {
  it("pages day bookings instead of a hard .limit(800)", () => {
    const src = readFileSync(join(process.cwd(), "app/api/admin/schedule/day/route.ts"), "utf8");
    expect(src).toContain("fetchAllScheduleDayBookings");
    expect(src).toContain("BOOKING_PAGE_SIZE");
    expect(src).not.toMatch(/\.limit\(\s*800\s*\)/);
    expect(src).toContain("truncated");
    expect(src).toContain("scannedBookings");
  });
});
