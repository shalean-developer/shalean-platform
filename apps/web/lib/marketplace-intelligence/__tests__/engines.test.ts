import { describe, expect, it } from "vitest";
import { predictAcceptanceProbability } from "@/lib/marketplace-intelligence/acceptanceProbability";
import { computeAssignmentOutcomeScore } from "@/lib/marketplace-intelligence/assignmentOutcomeFeedback";
import { scoreCleanerForBooking } from "@/lib/marketplace-intelligence/cleanerScoring";
import { clusterBookingsByLocation } from "@/lib/marketplace-intelligence/clusterBookings";
import { calculateDynamicPrice } from "@/lib/marketplace-intelligence/dynamicPricing";

describe("scoreCleanerForBooking", () => {
  it("ranks closer higher with similar other signals", () => {
    const booking = { bookingId: "b1" };
    const near = scoreCleanerForBooking(
      {
        id: "c1",
        distanceKm: 2,
        rating: 4.5,
        acceptanceRate: 0.95,
        recentDeclines: 0,
        lastAssignmentAt: null,
        workloadToday: 1,
      },
      booking,
    );
    const far = scoreCleanerForBooking(
      {
        id: "c2",
        distanceKm: 25,
        rating: 4.5,
        acceptanceRate: 0.95,
        recentDeclines: 0,
        lastAssignmentAt: null,
        workloadToday: 1,
      },
      booking,
    );
    expect(near.score).toBeGreaterThan(far.score);
    expect(near.breakdown.distance).toBeGreaterThan(far.breakdown.distance);
  });

  it("penalizes frequent declines and heavy workload", () => {
    const booking = { bookingId: "b2" };
    const clean = scoreCleanerForBooking(
      {
        id: "c1",
        distanceKm: 5,
        rating: 4,
        acceptanceRate: 0.9,
        recentDeclines: 0,
        lastAssignmentAt: null,
        workloadToday: 1,
      },
      booking,
    );
    const rough = scoreCleanerForBooking(
      {
        id: "c2",
        distanceKm: 5,
        rating: 4,
        acceptanceRate: 0.9,
        recentDeclines: 4,
        lastAssignmentAt: null,
        workloadToday: 6,
      },
      booking,
    );
    expect(clean.score).toBeGreaterThan(rough.score);
    expect(rough.breakdown.reliability).toBeLessThan(clean.breakdown.reliability);
    expect(rough.breakdown.workload).toBeLessThan(clean.breakdown.workload);
  });
});

describe("clusterBookingsByLocation", () => {
  it("assigns cluster_id and groups nearby same-time bookings", () => {
    const rows = clusterBookingsByLocation(
      [
        { id: "a", date: "2026-04-27", time: "09:00", lat: -33.9, lng: 18.4, locationId: "L1" },
        { id: "b", date: "2026-04-27", time: "09:15", lat: -33.901, lng: 18.401, locationId: "L1" },
        { id: "c", date: "2026-04-27", time: "16:00", lat: -34.5, lng: 19.2, locationId: "L2" },
      ],
      { radiusKm: 10, timeWindowMinutes: 120, seed: "tseed" },
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]!.cluster_id).toBe(rows[1]!.cluster_id);
    expect(rows[2]!.cluster_id).not.toBe(rows[0]!.cluster_id);
    expect(rows.every((r) => r.cluster_id.startsWith("mi_cluster_"))).toBe(true);
  });
});

describe("predictAcceptanceProbability", () => {
  it("rises with better acceptance and shorter distance", () => {
    const good = predictAcceptanceProbability({
      distanceKm: 3,
      acceptanceRecent: 0.95,
      acceptanceLifetime: 0.9,
      recentDeclines: 0,
      fatigueOffersLastHour: 0,
      hourOfDay: 11,
    });
    const bad = predictAcceptanceProbability({
      distanceKm: 40,
      acceptanceRecent: 0.45,
      acceptanceLifetime: 0.5,
      recentDeclines: 5,
      fatigueOffersLastHour: 8,
      hourOfDay: 8,
    });
    expect(good).toBeGreaterThan(bad);
  });
});

describe("computeAssignmentOutcomeScore", () => {
  it("rises with better review vs cleaner baseline", () => {
    const good = computeAssignmentOutcomeScore({
      dateYmd: null,
      slotTimeHm: null,
      startedAt: null,
      reviewRating1to5: 5,
      cleanerRating0to5: 4,
    });
    const weak = computeAssignmentOutcomeScore({
      dateYmd: null,
      slotTimeHm: null,
      startedAt: null,
      reviewRating1to5: 2,
      cleanerRating0to5: 4,
    });
    expect(good).toBeGreaterThan(weak);
  });
});

describe("calculateDynamicPrice", () => {
  it("raises price on high demand and peak hour", () => {
    const base = 500;
    const r = calculateDynamicPrice(
      base,
      { hourOfDay: 8, dayOfWeek: 2, demandLevel: "high", cleanerAvailabilityRatio: 0.1 },
      { emitLog: false },
    );
    expect(r.final_price).toBeGreaterThanOrEqual(base);
    expect(r.price_adjustment_reason).not.toBe("none");
  });

  it("applies discount on low demand", () => {
    const base = 400;
    const r = calculateDynamicPrice(
      base,
      { hourOfDay: 11, dayOfWeek: 3, demandLevel: "low", cleanerAvailabilityRatio: 0.8 },
      { emitLog: false },
    );
    expect(r.final_price).toBeLessThanOrEqual(base);
  });
});
