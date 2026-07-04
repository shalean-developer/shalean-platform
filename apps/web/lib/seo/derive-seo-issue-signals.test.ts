import { describe, expect, it } from "vitest";
import { deriveSeoIssueSignals, normalizePageHealthBand } from "./derive-seo-issue-signals";

describe("normalizePageHealthBand", () => {
  it("maps known bands", () => {
    expect(normalizePageHealthBand("critical")).toBe("critical");
    expect(normalizePageHealthBand("NEEDS IMPROVEMENT")).toBe("needs_improvement");
    expect(normalizePageHealthBand("strong")).toBe("strong");
  });

  it("defaults unknown values to strong", () => {
    expect(normalizePageHealthBand("")).toBe("strong");
    expect(normalizePageHealthBand("weird")).toBe("strong");
    expect(normalizePageHealthBand("insufficient_data")).toBe("insufficient_data");
  });
});

describe("deriveSeoIssueSignals", () => {
  it("flags low CTR vs impressions in critical band", () => {
    const s = deriveSeoIssueSignals(
      { health_band: "critical", health_score: 32 },
      undefined,
      { impressions: 2000, ctr_pct_display: 1.1, avg_position: 9 },
    );
    expect(s.topIssue).toBe("Low CTR vs impressions");
    expect(s.affectedMetric).toBe("acquisition");
    expect(s.recommendationType).toBe("title_meta");
    expect(s.confidence).toBeGreaterThan(0.7);
  });

  it("prefers scroll drop-off when CTR is not the main signal", () => {
    const s = deriveSeoIssueSignals(
      { health_band: "critical", health_score: 28 },
      { pct_to_50: 20 },
      { impressions: 100, ctr_pct_display: 4 },
    );
    expect(s.topIssue).toBe("Hero / intro drop-off");
    expect(s.affectedMetric).toBe("engagement");
  });

  it("returns maintain for strong band", () => {
    const s = deriveSeoIssueSignals({ health_band: "strong", health_score: 88 }, {}, {});
    expect(s.topIssue).toBe("Maintain momentum");
    expect(s.affectedMetric).toBe("maintain");
  });
});
