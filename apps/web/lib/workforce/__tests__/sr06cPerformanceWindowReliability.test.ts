import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scoreOfferReliability } from "@/lib/workforce/cleanerPerformanceScorecards";

const repoRoot = path.resolve(process.cwd(), "../..");
const source = fs.readFileSync(
  path.join(repoRoot, "apps/web/lib/workforce/cleanerPerformanceScorecards.ts"),
  "utf8",
);

describe("SR-06C performance-window reliability", () => {
  it("scores accepted offers only from the supplied evidence window", () => {
    expect(scoreOfferReliability([
      { status: "accepted" },
      { status: "rejected" },
      { status: "expired" },
      { status: "accepted" },
    ])).toEqual({ score: 50, totalOffers: 4, acceptedOffers: 2 });
  });

  it("treats a period with no offers as missing evidence instead of perfect or lifetime reliability", () => {
    expect(scoreOfferReliability([])).toEqual({
      score: null,
      totalOffers: 0,
      acceptedOffers: 0,
    });
  });

  it("reads canonical dispatch_offers inside the selected scorecard window", () => {
    expect(source).toContain('from("dispatch_offers")');
    expect(source).toContain('.gte("created_at",fromIso).lte("created_at",toIso)');
    expect(source).not.toContain('select("id, full_name, status, is_active, total_offers');
    expect(source).not.toContain("acceptance_rate_recent");
    expect(source).not.toContain("normalizedRate(");
  });
});
