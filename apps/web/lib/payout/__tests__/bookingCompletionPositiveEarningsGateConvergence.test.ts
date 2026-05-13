import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function requireMatch(src: string, pattern: RegExp, label: string): string {
  const match = src.match(pattern);
  expect(match, label).toBeTruthy();
  return match?.[0] ?? "";
}

describe("booking completion positive earnings gate convergence", () => {
  it("keeps the cleaner completion path on the strict positive display earnings helper", () => {
    const src = source("lib/cleaner/runCleanerBookingLifecycleAction.ts");

    expect(src).toContain("isCompletableDisplayEarningsCents");
    expect(src).toMatch(/!\s*isCompletableDisplayEarningsCents\s*\(\s*displayCents\s*\)/);
  });

  it("uses the same strict helper before admin PATCH completion is allowed to remain completed", () => {
    const src = source("app/api/admin/bookings/[id]/route.ts");
    const completionGate = requireMatch(
      src,
      /if\s*\(\s*needsEarningsIntegrityGate\s*\)\s*\{[\s\S]{0,300}?const\s+displayCents\s*=\s*await\s+fetchBookingDisplayEarningsCents\s*\(\s*admin\s*,\s*id\s*\)\s*;[\s\S]{0,300}?if\s*\(\s*!\s*isCompletableDisplayEarningsCents\s*\(\s*displayCents\s*\)\s*\)/,
      "admin completion gate must fetch displayCents and check it with isCompletableDisplayEarningsCents inside needsEarningsIntegrityGate",
    );

    expect(src).toContain("isCompletableDisplayEarningsCents");
    expect(completionGate).not.toContain("hasPersistedDisplayEarningsBasis(displayCents)");
  });

  it("uses the same strict helper before cron auto-completion is allowed", () => {
    const src = source("app/api/cron/booking-lifecycle/route.ts");
    const completionGate = requireMatch(
      src,
      /const\s+displayCents\s*=\s*await\s+fetchBookingDisplayEarningsCents\s*\(\s*admin\s*,\s*id\s*\)\s*;[\s\S]{0,300}?if\s*\(\s*!\s*isCompletableDisplayEarningsCents\s*\(\s*displayCents\s*\)\s*\)/,
      "cron completion gate must fetch displayCents and check it with isCompletableDisplayEarningsCents before completion update",
    );

    expect(src).toContain("isCompletableDisplayEarningsCents");
    expect(completionGate).not.toContain("hasPersistedDisplayEarningsBasis(displayCents)");
  });
});
