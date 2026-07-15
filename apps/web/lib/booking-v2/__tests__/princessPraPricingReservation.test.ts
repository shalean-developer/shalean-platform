import { describe, expect, it } from "vitest";
import { calculateCustomerTotal } from "@/lib/booking-v2/calculateCustomerTotal";
import { defaultBookingV2FeesConfig } from "@/lib/booking-v2/bookingV2FeesConfig";
import type { CustomerTotalInput } from "@/lib/booking-v2/types";
import { assessBookingQuoteReadiness } from "@/lib/booking-v2/bookingQuoteReadiness";
import { emptyCustomerPricingBreakdown } from "@/lib/booking-v2/emptyPricingBreakdown";
import {
  pricingServiceSlugCandidates,
  resolvePricingServiceRow,
} from "@/lib/booking-v2/resolvePricingServiceSlug";
import { resolveBookingV2Quote } from "@/lib/booking/quote/resolveBookingQuote";
import { assertV2ConfirmQuoteIntegrity } from "@/lib/booking/quote/validateBookingV2Quote";

function baseInput(overrides: Partial<CustomerTotalInput> = {}): CustomerTotalInput {
  const feesConfig = defaultBookingV2FeesConfig({ extraCleanerZar: 299 });
  feesConfig.serviceFeeRule = "flat";
  feesConfig.serviceFeeFlatCents = 3000;
  return {
    serviceSlug: "regular-cleaning",
    serviceLabel: "Regular Cleaning",
    serviceDetails: {
      bedrooms: "2",
      bathrooms: "1",
      extraRooms: "0",
      propertyType: "house",
    },
    selectedExtras: [],
    cleanerMode: "individual_cleaners",
    cleanerCount: 1,
    bookingType: "once_off",
    recurringFrequency: "",
    catalog: {
      basePrice: 450,
      pricePerBedroom: 80,
      pricePerBathroom: 60,
      pricePerExtraRoom: 30,
      pricePerExtraCleaner: 299,
      estimatedDurationHours: 3,
      minDurationHours: 3.5,
      maxDurationHours: 8,
      extras: [
        { id: "inside-oven", label: "Inside Oven", priceZar: 200 },
        { id: "inside-fridge", label: "Inside Fridge", priceZar: 150 },
      ],
    },
    feesConfig,
    ...overrides,
  };
}

describe("PRINCESS PR-A — quote calculation scenarios", () => {
  it("normal quote: base + rooms + service fee", () => {
    const r = calculateCustomerTotal(baseInput());
    expect(r.base_service_price).toBe(450);
    expect(r.bedrooms_price).toBe(160);
    expect(r.bathrooms_price).toBe(60);
    expect(r.service_fee).toBe(30);
    expect(r.estimated_total).toBe(700);
    expect(r.estimated_duration_minutes).toBeGreaterThanOrEqual(60);
  });

  it("zero bedrooms (studio): bathroom and base still price; bedrooms line is 0", () => {
    const r = calculateCustomerTotal(
      baseInput({
        serviceDetails: { bedrooms: "0", bathrooms: "1", extraRooms: "0", propertyType: "apartment" },
      }),
    );
    expect(r.bedrooms_price).toBe(0);
    expect(r.bathrooms_price).toBe(60);
    expect(r.estimated_total).toBe(540);
  });

  it("large room counts scale price and duration", () => {
    const small = calculateCustomerTotal(
      baseInput({
        serviceDetails: { bedrooms: "1", bathrooms: "1", extraRooms: "0" },
      }),
    );
    const large = calculateCustomerTotal(
      baseInput({
        serviceDetails: { bedrooms: "8", bathrooms: "4", extraRooms: "3" },
      }),
    );
    expect(large.estimated_total).toBeGreaterThan(small.estimated_total);
    expect(large.bedrooms_price).toBe(640);
    expect(large.bathrooms_price).toBe(240);
    expect(large.extra_rooms_price).toBe(90);
    expect(large.estimated_duration_minutes).toBeGreaterThan(small.estimated_duration_minutes);
  });

  it("extras increase total", () => {
    const plain = calculateCustomerTotal(baseInput());
    const withExtras = calculateCustomerTotal(
      baseInput({ selectedExtras: ["inside-oven", "inside-fridge"] }),
    );
    expect(withExtras.selected_extras_total).toBe(350);
    expect(withExtras.estimated_total).toBe(plain.estimated_total + 350);
  });

  it("recurring weekly applies discount", () => {
    const once = calculateCustomerTotal(baseInput());
    const weekly = calculateCustomerTotal(
      baseInput({ bookingType: "recurring", recurringFrequency: "weekly" }),
    );
    expect(weekly.recurring_discount).toBeGreaterThan(0);
    expect(weekly.estimated_total).toBeLessThan(once.estimated_total);
  });
});

describe("PRINCESS PR-A — quote integrity / readiness", () => {
  it("stale client quote is soft-accepted with server pricing", () => {
    const quote = resolveBookingV2Quote(baseInput());
    const result = assertV2ConfirmQuoteIntegrity({
      serverBreakdown: quote.breakdown,
      catalogLoaded: true,
      clientPricingSummary: {
        ...quote.breakdown,
        estimated_total: quote.breakdown.estimated_total + 80,
      },
      quoteInput: baseInput(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.soft).toBe(true);
      expect(result.code).toBe("quote_price_drift");
    }
  });

  it("missing / empty quote is not ready for payment", () => {
    expect(
      assessBookingQuoteReadiness({
        catalogLoading: false,
        pricingSummary: emptyCustomerPricingBreakdown(),
      }).ready,
    ).toBe(false);
    expect(
      assessBookingQuoteReadiness({
        catalogLoading: false,
        pricingSummary: null,
      }).reason,
    ).toBe("missing_quote");
  });

  it("server zero base+total is hard-rejected", () => {
    const quote = resolveBookingV2Quote(
      baseInput({
        catalog: {
          ...baseInput().catalog,
          basePrice: 0,
          pricePerBedroom: 0,
          pricePerBathroom: 0,
          pricePerExtraRoom: 0,
        },
      }),
    );
    const result = assertV2ConfirmQuoteIntegrity({
      serverBreakdown: {
        ...quote.breakdown,
        base_service_price: 0,
        estimated_total: 0,
      },
      catalogLoaded: true,
      clientPricingSummary: quote.breakdown,
      quoteInput: baseInput(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.soft).toBeFalsy();
      expect(result.code).toBe("quote_recompute_failed");
    }
  });

  it("valid calculated quote is ready", () => {
    const r = calculateCustomerTotal(baseInput());
    expect(
      assessBookingQuoteReadiness({
        catalogLoading: false,
        pricingSummary: r,
      }).ready,
    ).toBe(true);
  });
});

describe("PRINCESS PR-A — pricing service slug aliases (staging slug drift)", () => {
  it("maps standard-cleaning → standard engine rates", () => {
    expect(pricingServiceSlugCandidates("standard")).toContain("standard-cleaning");
    const row = resolvePricingServiceRow(
      {
        "standard-cleaning": { base_price: 450, price_per_bedroom: 80 },
      },
      "standard",
    );
    expect(row?.price_per_bedroom).toBe(80);
  });

  it("maps deep-cleaning → deep", () => {
    const row = resolvePricingServiceRow(
      {
        "deep-cleaning": { base_price: 750, price_per_bedroom: 100 },
      },
      "deep",
    );
    expect(row?.base_price).toBe(750);
  });
});

describe("PRINCESS PR-A — reservation conflict contracts (static)", () => {
  it("duplicate slot responses use 409 + SLOT_ALREADY_RESERVED contract in confirm route source", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "app/api/booking-v2/confirm/route.ts"),
      "utf8",
    );
    expect(src).toMatch(/SLOT_ALREADY_RESERVED/);
    expect(src).toMatch(/status:\s*409/);
  });

  it("paystack initialize no longer mislabels reserve failures as PRICING_SNAPSHOT_MISSING", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.join(process.cwd(), "lib/booking/paystackInitializeCore.ts"), "utf8");
    expect(src).toMatch(/RESERVATION_FAILED/);
    expect(src).toMatch(/BOOKING_SCHEMA_MISMATCH/);
    expect(src).not.toMatch(
      /errorCode:\s*"PRICING_SNAPSHOT_MISSING",\s*\n\s*error:\s*"Could not reserve your booking/,
    );
  });

  it("pending insert ownership is schema-aware (customer_id on staging)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "lib/booking/insertPendingPaymentBooking.ts"),
      "utf8",
    );
    expect(src).toMatch(/resolveBookingOwnershipColumn/);
    expect(src).not.toMatch(/customer_id:\s*authUid,\s*user_id:\s*authUid/);
  });
});
