import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { resolveLegacyBookingQuote, resolveBookingV2Quote } from "@/lib/booking/quote/resolveBookingQuote";
import { verifyBookingQuoteSignature } from "@/lib/booking/quote/bookingQuoteSignature";
import { BOOKING_QUOTE_ENGINE_VERSION } from "@/lib/booking/quote/bookingQuoteEngineVersion";
import { vitestTestPricingRatesSnapshot } from "@/lib/pricing/testPricingSnapshot";
import type { CustomerTotalInput } from "@/lib/booking-v2/types";
import { defaultBookingV2FeesConfig } from "@/lib/booking-v2/bookingV2FeesConfig";

const snap = vitestTestPricingRatesSnapshot();

describe("resolveBookingQuote (Phase 1 unified engine)", () => {
  const prevSecret = process.env.BOOKING_LOCK_HMAC_SECRET;

  beforeEach(() => {
    process.env.BOOKING_LOCK_HMAC_SECRET = "vitest-booking-quote-hmac";
  });

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.BOOKING_LOCK_HMAC_SECRET;
    else process.env.BOOKING_LOCK_HMAC_SECRET = prevSecret;
  });

  it("legacy quote binds price and canonical duration with a verifiable signature", () => {
    const r = resolveLegacyBookingQuote(
      {
        service: "standard",
        service_type: "standard_cleaning",
        rooms: 2,
        bathrooms: 1,
        extraRooms: 0,
        extras: ["inside-oven"],
        time: "10:00",
        vipTier: "regular",
      },
      snap,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.unified.calculation_version).toBe(BOOKING_QUOTE_ENGINE_VERSION);
    expect(r.unified.customer_price_zar).toBe(r.quote.totalZar);
    expect(r.unified.duration_minutes).toBeGreaterThan(0);
    expect(r.quote.hours).toBe(r.unified.duration_hours);
    expect(r.unified.duration_minutes).toBe(r.unified.duration_workload.duration_minutes);

    expect(
      verifyBookingQuoteSignature(
        {
          funnel: "legacy",
          customer_price_zar: r.unified.customer_price_zar,
          duration_minutes: r.unified.duration_minutes,
          duration_hours: r.unified.duration_hours,
          team_scaled_duration_minutes: r.unified.team_scaled_duration_minutes,
          cleaner_workload: r.unified.cleaner_workload,
          inputs: {
            job: {
              service: r.job.service,
              serviceType: r.job.serviceType ?? null,
              rooms: r.job.rooms,
              bathrooms: r.job.bathrooms,
              extraRooms: r.job.extraRooms,
              extras: [...r.job.extras].sort(),
            },
            timeHm: r.timeHm,
            vipTier: r.vipTier,
            dynamicAdjustment: r.quoteOptions.dynamicAdjustment ?? null,
            cleanersCount: r.quoteOptions.cleanersCount ?? null,
            checkoutTotalZar: r.quote.totalZar,
          },
        },
        r.unified.quote_signature,
      ),
    ).toBe(true);
  });

  it("v2 quote returns matching price, duration, and signature on breakdown", () => {
    const input: CustomerTotalInput & { serviceSlug: "regular-cleaning" } = {
      serviceSlug: "regular-cleaning",
      serviceLabel: "Regular Cleaning",
      serviceDetails: { bedrooms: "2", bathrooms: "1" },
      selectedExtras: ["inside-oven"],
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
        extras: [{ id: "inside-oven", label: "Inside oven", priceZar: 120 }],
        allowsExtraCleaner: true,
      },
      feesConfig: defaultBookingV2FeesConfig(),
    };

    const quote = resolveBookingV2Quote(input);
    expect(quote.customer_price_zar).toBe(quote.breakdown.estimated_total);
    expect(quote.duration_minutes).toBe(quote.breakdown.estimated_duration_minutes);
    expect(quote.breakdown.quote_signature).toBe(quote.quote_signature);
    expect(quote.breakdown.duration_hours).toBe(quote.duration_hours);
    expect(quote.breakdown.cleaner_workload).toBe(quote.cleaner_workload);
    expect(typeof quote.quote_signature).toBe("string");
    expect(quote.quote_signature.length).toBe(64);
  });

  it("extras increase duration and can change price together in v2", () => {
    const base: CustomerTotalInput & { serviceSlug: "regular-cleaning" } = {
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
        extras: [{ id: "inside-oven", label: "Inside oven", priceZar: 120 }],
      },
      feesConfig: defaultBookingV2FeesConfig(),
    };

    const withoutExtra = resolveBookingV2Quote(base);
    const withExtra = resolveBookingV2Quote({ ...base, selectedExtras: ["inside-oven"] });

    expect(withExtra.duration_minutes).toBeGreaterThan(withoutExtra.duration_minutes);
    expect(withExtra.customer_price_zar).toBeGreaterThan(withoutExtra.customer_price_zar);
  });
});
