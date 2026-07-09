import { describe, expect, it } from "vitest";
import {
  resolveLegacyJobDurationWorkload,
  resolveBookingV2DurationWorkload,
} from "@/lib/booking/quote/resolveBookingDurationWorkload";
import { vitestTestPricingRatesSnapshot } from "@/lib/pricing/testPricingSnapshot";

const snap = vitestTestPricingRatesSnapshot();

describe("resolveBookingDurationWorkload (Phase 3 admin limits)", () => {
  it("legacy funnel clamps to pricing snapshot min/max hours", () => {
    const tiny = resolveLegacyJobDurationWorkload(
      { service: "standard", rooms: 1, bathrooms: 1, extraRooms: 0, extras: [] },
      1,
      snap,
    );
    expect(tiny.duration_minutes).toBeGreaterThanOrEqual(210);
    expect(tiny.duration_minutes).toBeLessThanOrEqual(480);

    const huge = resolveLegacyJobDurationWorkload(
      {
        service: "standard",
        rooms: 25,
        bathrooms: 25,
        extraRooms: 25,
        extras: ["interior-walls", "garage-cleaning", "outside-windows"],
      },
      1,
      snap,
    );
    expect(huge.duration_minutes).toBe(480);
    expect(huge.guards).toContain("max_duration_clamped");
  });

  it("v2 funnel respects catalog duration limits", () => {
    const result = resolveBookingV2DurationWorkload({
      serviceSlug: "regular-cleaning",
      serviceDetails: { bedrooms: "1", bathrooms: "1" },
      selectedExtras: [],
      cleanerMode: "individual_cleaners",
      cleanerCount: 1,
      durationLimits: { minHours: 4.5, maxHours: 6 },
    });

    expect(result.duration_minutes).toBe(270);
    expect(result.guards).toContain("min_duration_clamped");
  });
});
