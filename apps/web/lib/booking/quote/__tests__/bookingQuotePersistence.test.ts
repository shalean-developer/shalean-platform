import { describe, expect, it } from "vitest";
import { defaultBookingV2FeesConfig } from "@/lib/booking-v2/bookingV2FeesConfig";
import { resolveBookingV2Quote } from "@/lib/booking/quote/resolveBookingQuote";
import {
  buildAuthoritativeQuotePersistPatch,
  resolvePersistedBookingDurationMinutes,
} from "@/lib/booking/quote/bookingQuotePersistence";

describe("bookingQuotePersistence (Phase 2)", () => {
  it("buildAuthoritativeQuotePersistPatch writes synchronized duration and price columns", () => {
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

    const patch = buildAuthoritativeQuotePersistPatch({
      breakdown: quote.breakdown,
      schedule: { date: "2026-07-15", time: "10:00" },
    });

    expect(patch.duration_minutes).toBe(quote.duration_minutes);
    expect(patch.estimated_duration_minutes).toBe(quote.duration_minutes);
    expect(patch.duration_hours).toBe(quote.duration_hours);
    expect(patch.total_paid_zar).toBe(quote.customer_price_zar);
    expect(patch.quote_calculation_version).toBe(quote.calculation_version);
    expect(typeof patch.estimated_finish_at).toBe("string");
    expect(patch.cleaner_workload).toBe(quote.cleaner_workload);
  });

  it("resolvePersistedBookingDurationMinutes prefers duration_minutes then pricing_summary", () => {
    expect(
      resolvePersistedBookingDurationMinutes({
        duration_minutes: 210,
        estimated_duration_minutes: 180,
      }),
    ).toBe(210);

    expect(
      resolvePersistedBookingDurationMinutes({
        duration_minutes: null,
        estimated_duration_minutes: 195,
      }),
    ).toBe(195);

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

    expect(
      resolvePersistedBookingDurationMinutes({
        duration_minutes: null,
        pricing_summary: quote.breakdown,
      }),
    ).toBe(quote.duration_minutes);
  });

  it("resolvePersistedBookingDurationMinutes falls back to duration_hours when minutes are missing", () => {
    expect(
      resolvePersistedBookingDurationMinutes({
        duration_minutes: null,
        estimated_duration_minutes: null,
        duration_hours: 3.5,
      }),
    ).toBe(210);

    expect(
      resolvePersistedBookingDurationMinutes({
        duration_minutes: null,
        pricing_summary: {
          estimated_duration_minutes: 0,
          duration_hours: 2.5,
          base_service_price: 0,
          property_factors_total: 0,
          bedrooms_price: 0,
          bathrooms_price: 0,
          extra_rooms_price: 0,
          property_size_price: 0,
          selected_extras: [],
          selected_extras_total: 0,
          supplies_equipment_fee: 0,
          equipment_logistics_fee: 0,
          equipment_distance_km: 0,
          equipment_base_fee: 0,
          equipment_distance_charge: 0,
          manual_quote_required: false,
          extra_cleaner_cost: 0,
          cleaning_service_subtotal: 0,
          subtotal_before_service_fee: 0,
          service_fee: 0,
          recurring_discount: 0,
          estimated_total: 0,
          lineItems: [],
          basePrice: 0,
          extrasTotal: 0,
          cleanerSurcharge: 0,
          total: 0,
        },
      }),
    ).toBe(150);

    expect(
      resolvePersistedBookingDurationMinutes({
        duration_minutes: null,
        duration_hours: 0,
      }),
    ).toBeNull();
  });
});
