import { describe, expect, it, vi } from "vitest";
import type { AggregatedSeoEvents } from "@/lib/seo/optimization/aggregate-seo-events";
import {
  expectedCtrForPosition,
  expectedCtrPctForPosition,
  runSeoOptimizationEngine,
  SCROLL_MIN_SESSIONS_BASELINE,
} from "@/lib/seo/optimization/engine";

vi.mock("@/lib/seo/location-seo-feedback", () => ({
  getLocationGscMetrics: (slug: string) => {
    if (slug === "sea-point-cleaning-services") {
      return { impressions: 120, ctr: 0.0286, avg_position: 21.7 };
    }
    if (slug === "wynberg-cleaning-services") {
      return { impressions: 196, ctr: 0.0102, avg_position: 13.6 };
    }
    return null;
  },
  getLocationGscVariantMetrics: () => null,
  getExplicitEnvTitleVariant: () => null,
  hasManualLocationMetaTitle: () => false,
}));

const EMPTY_AGG: AggregatedSeoEvents = {
  scrollFunnels: [],
  ctaKindLocationBooking: [],
  slugCtaKindLocationBooking: [],
  heroBookNowBySlugLabel: [],
  suburbCtaBooking: [],
  topSuburbsByCtaClicks: [],
  topCtaCompound: [],
};

describe("expectedCtrForPosition", () => {
  it("returns lower benchmarks deeper in SERPs", () => {
    expect(expectedCtrForPosition(5)).toBeGreaterThan(expectedCtrForPosition(25));
    expect(expectedCtrPctForPosition(21.7)).toBe(1.8);
  });
});

describe("runSeoOptimizationEngine", () => {
  it("marks GSC-only pages with fair CTR as insufficient_data, not critical", () => {
    const result = runSeoOptimizationEngine(EMPTY_AGG);
    const seaPoint = result.pageHealth.find((r) => r.slug === "sea-point-cleaning-services");
    expect(seaPoint).toBeDefined();
    expect(seaPoint!.band).not.toBe("critical");
    expect(seaPoint!.data_gaps.missing_signals.some((s) => s.includes("scroll sessions"))).toBe(true);
  });

  it("keeps weak CTR pages critical when GSC shows underperformance", () => {
    const result = runSeoOptimizationEngine(EMPTY_AGG);
    const wynberg = result.pageHealth.find((r) => r.slug === "wynberg-cleaning-services");
    expect(wynberg?.band).toBe("critical");
  });

  it("includes scroll and CTA thresholds in data gaps", () => {
    const result = runSeoOptimizationEngine(EMPTY_AGG);
    const row = result.pageHealth[0];
    expect(row?.data_gaps.scroll_sessions_needed).toBe(SCROLL_MIN_SESSIONS_BASELINE);
    expect(row?.data_gaps.cta_sessions_needed).toBe(10);
  });
});
