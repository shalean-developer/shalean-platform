import { describe, expect, it } from "vitest";
import {
  buildAuthoritativeQuoteDurationOnlyPatch,
  buildAuthoritativeQuotePersistPatch,
} from "@/lib/booking/quote/bookingQuotePersistence";
import { defaultBookingV2FeesConfig } from "@/lib/booking-v2/bookingV2FeesConfig";
import { resolveBookingV2Quote } from "@/lib/booking/quote/resolveBookingQuote";

describe("buildAuthoritativeQuoteDurationOnlyPatch (Phase 4)", () => {
  it("persists duration and pricing_summary without payment cent fields", () => {
    const quote = resolveBookingV2Quote({
      serviceSlug: "regular-cleaning",
      serviceLabel: "Regular Cleaning",
      serviceDetails: { bedrooms: "2", bathrooms: "1" },
      selectedExtras: [],
      cleanerMode: "individual_cleaners",
      cleanerCount: 1,
      bookingType: "once_off",
      recurringFrequency: "",
      catalog: {
        basePrice: 500,
        pricePerBedroom: 50,
        pricePerBathroom: 40,
        pricePerExtraRoom: 30,
        pricePerExtraCleaner: 200,
        estimatedDurationHours: 3,
        minDurationHours: 3.5,
        maxDurationHours: 8,
        extras: [],
      },
      feesConfig: defaultBookingV2FeesConfig(),
    });

    const full = buildAuthoritativeQuotePersistPatch({ breakdown: quote.breakdown });
    const durationOnly = buildAuthoritativeQuoteDurationOnlyPatch({ breakdown: quote.breakdown });

    expect(durationOnly.pricing_summary).toEqual(full.pricing_summary);
    expect(durationOnly.duration_minutes).toBe(full.duration_minutes);
    expect(durationOnly).not.toHaveProperty("amount_paid_cents");
    expect(durationOnly).not.toHaveProperty("total_paid_zar");
    expect(durationOnly).not.toHaveProperty("total_price");
  });
});
