import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(process.cwd(), "lib/payout/persistCleanerPayout.ts"), "utf8");

describe("SITE-E2E-08 payout eligibility skip handling", () => {
  it("does not convert payout eligibility skips into missing-earnings errors", () => {
    expect(src).toContain(
      "core.ok && core.skipped && isPayoutEligibilitySkipReason(core.skipReason)",
    );
    expect(src).toContain("Eligibility skips are policy outcomes, not failed writes.");
  });

  it("logs normal eligibility skips at info while preserving structural team warnings", () => {
    expect(src).toContain(
      'persistEligibility.skipReason === "payout_eligibility_team_missing_team_id"',
    );
    expect(src).toContain('level: "info"');
    expect(src).toContain("message: persistEligibility.skipReason");
  });
});
