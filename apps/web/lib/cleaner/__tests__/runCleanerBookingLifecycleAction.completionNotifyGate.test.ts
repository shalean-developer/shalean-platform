import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("runCleanerBookingLifecycleAction completion notify gating (static guard)", () => {
  it("sends legacy notifyBookingEvent(completed) only when BOOKING_COMPLETED_ROUTER_ENABLED is off", () => {
    const src = readFileSync(join(process.cwd(), "lib/cleaner/runCleanerBookingLifecycleAction.ts"), "utf8");
    const idx = src.indexOf('type: "completed"');
    expect(idx).toBeGreaterThan(-1);
    const slice = src.slice(Math.max(0, idx - 500), idx + 80);
    expect(slice).toContain("isBookingCompletedRouterEnabled");
    expect(slice).toMatch(/if\s*\(\s*!\s*isBookingCompletedRouterEnabled\s*\(\s*\)\s*\)/);
  });
});
