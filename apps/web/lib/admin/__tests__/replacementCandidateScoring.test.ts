import { describe, expect, it } from "vitest";
import {
  compositeReplacementScore,
  distanceScoreFromKm,
  haversineDistanceKm,
  labelFromCleanerState,
  ratingSubscore,
  reliabilityScoreFromJobs,
} from "@/lib/admin/replacementCandidateScoring";

describe("replacementCandidateScoring", () => {
  it("haversineDistanceKm is reasonable for short hop", () => {
    const d = haversineDistanceKm(-33.9, 18.4, -33.95, 18.45);
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(0);
    expect(d!).toBeLessThan(25);
  });

  it("distanceScoreFromKm buckets", () => {
    expect(distanceScoreFromKm(2)).toBe(100);
    expect(distanceScoreFromKm(7)).toBe(70);
    expect(distanceScoreFromKm(15)).toBe(40);
    expect(distanceScoreFromKm(25)).toBe(10);
    expect(distanceScoreFromKm(null)).toBe(50);
  });

  it("compositeReplacementScore stays within 0–100", () => {
    const s = compositeReplacementScore({
      rating: 100,
      availability: 100,
      distance: 100,
      reliability: 100,
    });
    expect(s).toBe(100);
    const s2 = compositeReplacementScore({
      rating: 0,
      availability: 0,
      distance: 0,
      reliability: 0,
    });
    expect(s2).toBe(0);
  });

  it("labelFromCleanerState respects overlap and offline", () => {
    expect(
      labelFromCleanerState({ status: "offline", isAvailable: false, slotOverlap: false }),
    ).toBe("unavailable");
    expect(
      labelFromCleanerState({ status: "available", isAvailable: true, slotOverlap: true }),
    ).toBe("busy");
    expect(
      labelFromCleanerState({ status: "busy", isAvailable: true, slotOverlap: false }),
    ).toBe("busy");
    expect(
      labelFromCleanerState({ status: "available", isAvailable: true, slotOverlap: false }),
    ).toBe("available");
  });

  it("ratingSubscore and reliabilityScoreFromJobs are bounded", () => {
    expect(ratingSubscore(5)).toBe(100);
    expect(ratingSubscore(null)).toBe(70);
    expect(reliabilityScoreFromJobs(0)).toBeLessThanOrEqual(100);
    expect(reliabilityScoreFromJobs(9999)).toBe(100);
  });
});
