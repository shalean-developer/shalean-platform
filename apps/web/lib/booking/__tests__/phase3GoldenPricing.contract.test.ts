import { describe, expect, it } from "vitest";
import {
  applyVipToCleaningSubtotalZar,
  computePropertyFactors,
  computeServiceFeeZar,
  estimateBookingV2DurationMinutes,
  resolveBookingV2DurationEstimate,
} from "@shalean/pricing";

/**
 * Golden-path fixture: same inputs must yield identical ZAR/minutes across
 * web SoT and mobile display (both import @shalean/pricing).
 */
const FIXTURE = {
  serviceSlug: "regular-cleaning",
  serviceDetails: { bedrooms: 2, bathrooms: 1, extraRooms: 1, propertyType: "apartment" },
  catalog: { pricePerBedroom: 50, pricePerBathroom: 40, pricePerExtraRoom: 30 },
  rates: { propertyType: { apartment: 25, house: 50 } },
  basePrice: 400,
  fees: {
    serviceFeeRule: "percent" as const,
    serviceFeeFlatCents: 0,
    serviceFeePercent: 5,
    recurringDiscounts: {},
  },
};

describe("Phase 3 golden pricing fixture", () => {
  it("property factors match expected ZAR", () => {
    const factors = computePropertyFactors(
      FIXTURE.serviceSlug,
      FIXTURE.serviceDetails,
      FIXTURE.catalog,
      FIXTURE.rates,
    );
    // 2*50 + 1*40 + 1*30 + apartment 25 = 100+40+30+25 = 195
    expect(factors.bedrooms_price).toBe(100);
    expect(factors.bathrooms_price).toBe(40);
    expect(factors.extra_rooms_price).toBe(30);
    expect(factors.property_size_price).toBe(25);
    expect(factors.property_factors_total).toBe(195);
  });

  it("VIP + fee stack is deterministic", () => {
    const cleaning = FIXTURE.basePrice + 195; // 595
    const vip = applyVipToCleaningSubtotalZar(cleaning, "gold");
    // gold multiplier 0.9 → after = round(595*0.9)=536, discount = 59
    expect(vip.cleaningSubtotalAfterVipZar).toBe(536);
    expect(vip.vipDiscountZar).toBe(59);
    const fee = computeServiceFeeZar(vip.cleaningSubtotalAfterVipZar, FIXTURE.fees);
    expect(fee).toBe(26.8);
  });

  it("duration estimate is stable with team scaling", () => {
    const solo = estimateBookingV2DurationMinutes({
      serviceSlug: FIXTURE.serviceSlug,
      serviceDetails: FIXTURE.serviceDetails,
      selectedExtras: [],
    });
    // 180 + 2*30 + 1*30 + 1*18 = 180+60+30+18 = 288
    expect(solo).toBe(288);

    const team = resolveBookingV2DurationEstimate({
      serviceSlug: FIXTURE.serviceSlug,
      serviceDetails: FIXTURE.serviceDetails,
      selectedExtras: [],
      cleanerMode: "team",
      cleanerCount: 1,
    });
    expect(team.duration_minutes).toBe(288);
    expect(team.team_scaled_duration_minutes).toBeLessThan(288);
    expect(team.team_member_count).toBe(3);
  });
});
