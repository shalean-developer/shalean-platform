import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static guard against regressions of the R0 completion block.
 *
 * Background: backfilled / recurring monthly-invoice bookings can land with
 * `bookings.display_earnings_cents = 0` when the row had no payment basis at
 * first persist. The pre-existing `hasPersistedDisplayEarningsBasis(0) === true`
 * meant completion would silently succeed against R0, recording a no-payout
 * job. The fix adds `isCompletableDisplayEarningsCents` (strict positive) as
 * a second gate after persist+verify and returns 422 with a stable code.
 *
 * If you remove this gate, you will reintroduce the "Complete with R0,00"
 * regression — the canonical fix is to repair the booking earnings via
 * `POST /api/admin/bookings/[id]/reset-earnings?force=true` or the bulk
 * `npm run repair:zero-earning-assigned` script, NOT to relax this gate.
 */
describe("runCleanerBookingLifecycleAction R0 completion gate (static guard)", () => {
  const src = readFileSync(
    join(process.cwd(), "lib/cleaner/runCleanerBookingLifecycleAction.ts"),
    "utf8",
  );

  it("imports the strict positive helper", () => {
    expect(src).toContain("isCompletableDisplayEarningsCents");
    expect(src).toMatch(/from\s+["']@\/lib\/payout\/bookingEarningsIntegrity["']/);
  });

  it("imports the stable error code from the canonical earning module", () => {
    expect(src).toContain("JOB_EARNING_UNAVAILABLE_ERROR_CODE");
    expect(src).toMatch(/from\s+["']@\/lib\/cleaner\/cleanerJobEarning["']/);
  });

  it("checks isCompletableDisplayEarningsCents on the resolved displayCents", () => {
    expect(src).toMatch(/!\s*isCompletableDisplayEarningsCents\s*\(\s*displayCents\s*\)/);
  });

  it("returns HTTP 422 with the job_earning_unavailable code when the gate fails", () => {
    const idx = src.indexOf("isCompletableDisplayEarningsCents(displayCents)");
    expect(idx).toBeGreaterThan(-1);
    const slice = src.slice(idx, idx + 1500);
    expect(slice).toContain("status: 422");
    expect(slice).toContain("code: JOB_EARNING_UNAVAILABLE_ERROR_CODE");
    expect(slice).toContain('reasonCode: JOB_EARNING_UNAVAILABLE_ERROR_CODE');
  });

  it("places the strict gate AFTER the existing 'verify' (null-check) block, not before", () => {
    const verifyIdx = src.indexOf('"display_earnings_cents missing after persist (pre-complete verify)"');
    const strictIdx = src.indexOf("isCompletableDisplayEarningsCents(displayCents)");
    expect(verifyIdx).toBeGreaterThan(-1);
    expect(strictIdx).toBeGreaterThan(-1);
    expect(strictIdx).toBeGreaterThan(verifyIdx);
  });
});
