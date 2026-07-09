import { describe, expect, it } from "vitest";
import { defaultBookingV2FeesConfig } from "@/lib/booking-v2/bookingV2FeesConfig";
import { resolveBookingV2Quote } from "@/lib/booking/quote/resolveBookingQuote";
import {
  assertV2ConfirmQuoteIntegrity,
  buildBookingV2QuoteSignatureInputs,
} from "@/lib/booking/quote/validateBookingV2Quote";

describe("validateBookingV2Quote (Phase 4)", () => {
  const baseInput = {
    serviceSlug: "regular-cleaning" as const,
    serviceLabel: "Regular Cleaning",
    serviceDetails: { bedrooms: "2", bathrooms: "1" },
    selectedExtras: [] as string[],
    cleanerMode: "individual_cleaners" as const,
    cleanerCount: 1,
    bookingType: "once_off" as const,
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
  };

  it("accepts a server breakdown that verifies against its inputs", () => {
    const quote = resolveBookingV2Quote(baseInput);
    const result = assertV2ConfirmQuoteIntegrity({
      serverBreakdown: quote.breakdown,
      catalogLoaded: true,
      clientPricingSummary: quote.breakdown,
      quoteInput: baseInput,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects price drift beyond 1%", () => {
    const quote = resolveBookingV2Quote(baseInput);
    const tampered = { ...quote.breakdown, estimated_total: quote.breakdown.estimated_total + 50 };
    const result = assertV2ConfirmQuoteIntegrity({
      serverBreakdown: quote.breakdown,
      catalogLoaded: true,
      clientPricingSummary: tampered,
      quoteInput: baseInput,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("quote_price_drift");
  });

  it("rejects duration drift beyond 1%", () => {
    const quote = resolveBookingV2Quote(baseInput);
    const tampered = {
      ...quote.breakdown,
      estimated_duration_minutes: quote.breakdown.estimated_duration_minutes + 30,
    };
    const result = assertV2ConfirmQuoteIntegrity({
      serverBreakdown: quote.breakdown,
      catalogLoaded: true,
      clientPricingSummary: tampered,
      quoteInput: baseInput,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("quote_duration_drift");
  });

  it("rejects client signature mismatch", () => {
    const quote = resolveBookingV2Quote(baseInput);
    const result = assertV2ConfirmQuoteIntegrity({
      serverBreakdown: quote.breakdown,
      catalogLoaded: true,
      clientPricingSummary: { ...quote.breakdown, quote_signature: "deadbeef".repeat(8) },
      quoteInput: baseInput,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("quote_client_signature_mismatch");
  });

  it("buildBookingV2QuoteSignatureInputs matches resolveBookingV2Quote signing payload", () => {
    const quote = resolveBookingV2Quote(baseInput);
    const inputs = buildBookingV2QuoteSignatureInputs(baseInput, quote.breakdown);
    expect(inputs.estimatedTotal).toBe(quote.breakdown.estimated_total);
    expect(inputs.selectedExtras).toEqual([]);
  });
});
