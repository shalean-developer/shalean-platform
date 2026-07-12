import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimateBookingDurationMinutes } from "../estimateDurationMinutes";

describe("estimateBookingDurationMinutes", () => {
  it("matches standard room-based workload (base + rooms + baths)", () => {
    const minutes = estimateBookingDurationMinutes({
      serviceSlug: "regular-cleaning",
      serviceDetails: { bedrooms: 2, bathrooms: 1, extraRooms: 0 },
      selectedExtras: [],
    });
    // 180 + 2*30 + 1*30 = 270
    assert.equal(minutes, 270);
  });

  it("adds known extras duration", () => {
    const minutes = estimateBookingDurationMinutes({
      serviceSlug: "regular-cleaning",
      serviceDetails: { bedrooms: 1, bathrooms: 1, extraRooms: 0 },
      selectedExtras: ["inside-oven", "ironing"],
    });
    // 180 + 30 + 30 + 45 + 30 = 315
    assert.equal(minutes, 315);
  });

  it("clamps to catalog min/max hours when provided", () => {
    const minutes = estimateBookingDurationMinutes({
      serviceSlug: "regular-cleaning",
      serviceDetails: { bedrooms: 1, bathrooms: 1, extraRooms: 0 },
      selectedExtras: [],
      minDurationHours: 6,
      maxDurationHours: 8,
    });
    assert.equal(minutes, 360);
  });

  it("team mode returns shorter wall-clock when useTeamScaled", () => {
    const unscaled = estimateBookingDurationMinutes({
      serviceSlug: "regular-cleaning",
      serviceDetails: { bedrooms: 2, bathrooms: 1, extraRooms: 0 },
      selectedExtras: [],
      cleanerMode: "team",
      cleanerCount: 1,
    });
    const scaled = estimateBookingDurationMinutes({
      serviceSlug: "regular-cleaning",
      serviceDetails: { bedrooms: 2, bathrooms: 1, extraRooms: 0 },
      selectedExtras: [],
      cleanerMode: "team",
      cleanerCount: 1,
      useTeamScaled: true,
    });
    assert.equal(unscaled, 270);
    assert.ok(scaled < unscaled);
    assert.ok(scaled >= 60);
  });
});
