import { describe, expect, it } from "vitest";
import {
  earningsFitScore01,
  proximityScore01,
  scoreCleanerForJob,
} from "@/lib/dispatch/scoreCleanerForJob";

describe("scoreCleanerForJob", () => {
  it("scores closer cleaners higher when max distance fixed", () => {
    const maxKm = 20;
    const near = scoreCleanerForJob(
      {
        distanceKm: 2,
        availabilityOk: true,
        reliability01: 0.8,
        fatigueOffersLastHour: 0,
      },
      maxKm,
    );
    const far = scoreCleanerForJob(
      {
        distanceKm: 18,
        availabilityOk: true,
        reliability01: 0.8,
        fatigueOffersLastHour: 0,
      },
      maxKm,
    );
    expect(near).toBeGreaterThan(far);
  });

  it("uses 0.5 proximity when distance unknown", () => {
    const a = scoreCleanerForJob(
      {
        distanceKm: null,
        availabilityOk: true,
        reliability01: 1,
        fatigueOffersLastHour: 0,
      },
      10,
    );
    const b = scoreCleanerForJob(
      {
        distanceKm: 10,
        availabilityOk: true,
        reliability01: 1,
        fatigueOffersLastHour: 0,
      },
      10,
    );
    expect(a).toBeGreaterThan(b);
  });

  it("penalizes high fatigue (recency proxy)", () => {
    const fresh = scoreCleanerForJob(
      {
        distanceKm: 5,
        availabilityOk: true,
        reliability01: 0.9,
        fatigueOffersLastHour: 0,
      },
      10,
    );
    const tired = scoreCleanerForJob(
      {
        distanceKm: 5,
        availabilityOk: true,
        reliability01: 0.9,
        fatigueOffersLastHour: 4,
      },
      10,
    );
    expect(fresh).toBeGreaterThan(tired);
  });
});

describe("proximityScore01", () => {
  it("returns 0.5 when distance is null", () => {
    expect(proximityScore01(null, 20)).toBe(0.5);
  });
});

describe("earningsFitScore01", () => {
  it("is neutral when either side unknown", () => {
    expect(earningsFitScore01(null, 100)).toBe(0.5);
    expect(earningsFitScore01(100, null)).toBe(0.5);
  });
});
