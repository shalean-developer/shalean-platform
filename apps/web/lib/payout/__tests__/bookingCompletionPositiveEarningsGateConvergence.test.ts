import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function sliceBetween(src: string, startToken: string, endToken: string): string {
  const start = src.indexOf(startToken);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = src.indexOf(endToken, start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe("booking completion positive earnings gate convergence", () => {
  it("keeps the cleaner completion path on the strict positive display earnings helper", () => {
    const src = source("lib/cleaner/runCleanerBookingLifecycleAction.ts");

    expect(src).toContain("isCompletableDisplayEarningsCents");
    expect(src).toMatch(/!\s*isCompletableDisplayEarningsCents\s*\(\s*displayCents\s*\)/);
  });

  it("uses the same strict helper before admin PATCH completion is allowed to remain completed", () => {
    const src = source("app/api/admin/bookings/[id]/route.ts");
    const completionGate = sliceBetween(
      src,
      "if (needsEarningsIntegrityGate) {\n            const displayCents = await fetchBookingDisplayEarningsCents(admin, id);",
      "} else if (!payout.ok) {",
    );

    expect(src).toContain("isCompletableDisplayEarningsCents");
    expect(completionGate).toMatch(/!\s*isCompletableDisplayEarningsCents\s*\(\s*displayCents\s*\)/);
    expect(completionGate).not.toContain("hasPersistedDisplayEarningsBasis(displayCents)");
  });

  it("uses the same strict helper before cron auto-completion is allowed", () => {
    const src = source("app/api/cron/booking-lifecycle/route.ts");
    const completionGate = sliceBetween(
      src,
      "const displayCents = await fetchBookingDisplayEarningsCents(admin, id);",
      "} catch (e) {",
    );

    expect(src).toContain("isCompletableDisplayEarningsCents");
    expect(completionGate).toMatch(/!\s*isCompletableDisplayEarningsCents\s*\(\s*displayCents\s*\)/);
    expect(completionGate).not.toContain("hasPersistedDisplayEarningsBasis(displayCents)");
  });
});
