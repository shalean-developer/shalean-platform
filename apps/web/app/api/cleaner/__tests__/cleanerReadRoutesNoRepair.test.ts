import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const routes = [
  "app/api/cleaner/jobs/route.ts",
  "app/api/cleaner/dashboard/route.ts",
  "app/api/cleaner/jobs/[id]/route.ts",
];

describe("cleaner read routes do not schedule earnings repair", () => {
  for (const route of routes) {
    it(`${route} keeps stuck-earnings handling diagnostic-only`, () => {
      const source = readFileSync(join(process.cwd(), route), "utf8");
      expect(source).not.toContain("scheduleStuckEarningsRecomputeDebounced");
      expect(source).toContain("maybeLogStuckNullEarnings");
    });
  }

  it("keeps the shared earnings preview helper read-only", () => {
    const source = readFileSync(
      join(process.cwd(), "lib/cleaner/applyPreviewEarningsToCleanerJobRows.ts"),
      "utf8",
    );
    expect(source).not.toContain("persistCleanerPayoutIfUnset");
    expect(source).toContain("previewDisplayEarningsCentsForCleanerJob");
  });

  it("central preview suppresses earnings when payout attribution was removed", () => {
    const source = readFileSync(
      join(process.cwd(), "lib/payout/persistCleanerPayout.ts"),
      "utf8",
    );
    expect(source).toContain("bookingHasActivePayoutAttributionRemoval");
    expect(source).toContain('ATTRIBUTION_REMOVED: "payout_attribution_removed"');
    expect(source).toContain("missingReason: PREVIEW_EARNINGS_MISS.ATTRIBUTION_REMOVED");
  });

  it("job detail loads removal metadata and skips preview/fallback earnings", () => {
    const source = readFileSync(join(process.cwd(), "app/api/cleaner/jobs/[id]/route.ts"), "utf8");
    expect(source).toContain("admin_recurring_unpaid_completion_override_by, metadata");
    expect(source).toContain("const attributionRemoved = bookingHasActivePayoutAttributionRemoval(record)");
    expect(source).toContain("if (!persistedIsPositive && !attributionRemoved)");
    expect(source).toContain("const jobEarningCents = attributionRemoved ? null");
    expect(source).toContain("metadata: _omitMetadata");
  });
});
