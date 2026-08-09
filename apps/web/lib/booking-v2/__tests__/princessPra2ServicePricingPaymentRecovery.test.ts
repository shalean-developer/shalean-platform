import { describe, expect, it } from "vitest";
import { calculateCustomerTotal } from "@/lib/booking-v2/calculateCustomerTotal";
import { defaultBookingV2FeesConfig } from "@/lib/booking-v2/bookingV2FeesConfig";
import type { CustomerTotalInput } from "@/lib/booking-v2/types";
import {
  canonicalizePricingServiceSlug,
  pricingServiceSlugCandidates,
  resolveMovingPricingSlug,
  resolvePricingServiceRow,
} from "@/lib/booking-v2/resolvePricingServiceSlug";
import { SERVICE_PRICING_CONTRACTS } from "@/lib/booking-v2/servicePricingContract";
import { assertQuotePricingInputsConsumed } from "@/lib/booking-v2/assertQuotePricingInputsConsumed";
import { formatEstimatedCleaningTimeLabel } from "@/lib/booking-v2/formatEstimatedCleaningTime";
import { DB_SLUG_MAP } from "@/lib/booking-v2/loadBookingV2CatalogMaps";
import type { ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";

function fees() {
  const feesConfig = defaultBookingV2FeesConfig({ extraCleanerZar: 299 });
  feesConfig.serviceFeeRule = "flat";
  feesConfig.serviceFeeFlatCents = 3000;
  feesConfig.propertyFactorRates.carpetRooms_per_room_zar = 200;
  feesConfig.propertyFactorRates.rugs_per_unit_zar = 180;
  feesConfig.propertyFactorRates.sofa_per_unit_zar = 250;
  return feesConfig;
}

function baseCatalog(overrides: Partial<CustomerTotalInput["catalog"]> = {}) {
  return {
    basePrice: 450,
    pricePerBedroom: 80,
    pricePerBathroom: 60,
    pricePerExtraRoom: 30,
    pricePerExtraCleaner: 299,
    estimatedDurationHours: 3,
    minDurationHours: 2,
    maxDurationHours: 10,
    extras: [
      { id: "sofa-upholstery", label: "Sofa / upholstery", priceZar: 250 },
      { id: "laundry", label: "Laundry", priceZar: 150 },
      { id: "inside-oven", label: "Inside Oven", priceZar: 200 },
    ],
    allowsExtraCleaner: true,
    ...overrides,
  };
}

function input(
  serviceSlug: ServiceSlug,
  serviceDetails: Record<string, string | number | boolean>,
  overrides: Partial<CustomerTotalInput> = {},
): CustomerTotalInput {
  return {
    serviceSlug,
    serviceLabel: serviceSlug,
    serviceDetails,
    selectedExtras: [],
    cleanerMode: "individual_cleaners",
    cleanerCount: 1,
    bookingType: "once_off",
    recurringFrequency: "",
    catalog: baseCatalog(),
    feesConfig: fees(),
    ...overrides,
  };
}

describe("PRINCESS PRA2 — canonical service aliases", () => {
  const cases: Array<{ alias: string; canonical: string }> = [
    { alias: "standard", canonical: "standard" },
    { alias: "standard-cleaning", canonical: "standard" },
    { alias: "regular", canonical: "standard" },
    { alias: "regular-cleaning", canonical: "standard" },
    { alias: "deep", canonical: "deep" },
    { alias: "deep-cleaning", canonical: "deep" },
    { alias: "move", canonical: "move" },
    { alias: "moving-cleaning", canonical: "move" },
    { alias: "move-in", canonical: "move-in" },
    { alias: "move_in", canonical: "move-in" },
    { alias: "move-out", canonical: "move-out" },
    { alias: "move_out", canonical: "move-out" },
    { alias: "airbnb", canonical: "airbnb" },
    { alias: "airbnb-cleaning", canonical: "airbnb" },
    { alias: "carpet", canonical: "carpet" },
    { alias: "carpet-cleaning", canonical: "carpet" },
    { alias: "office", canonical: "office" },
    { alias: "office-cleaning", canonical: "office" },
    { alias: "quick", canonical: "office" },
  ];

  it.each(cases)("$alias → $canonical", ({ alias, canonical }) => {
    expect(canonicalizePricingServiceSlug(alias)).toBe(canonical);
    expect(pricingServiceSlugCandidates(alias)[0]).toBe(canonical);
  });

  it("DB_SLUG_MAP uses office (not standard) for office-cleaning", () => {
    expect(DB_SLUG_MAP["office-cleaning"]).toBe("office");
  });

  it("resolvePricingServiceRow prefers exact alias rows", () => {
    const db = {
      "standard-cleaning": { base: 1 },
      standard: { base: 2 },
      "move-out": { base: 9 },
      move: { base: 8 },
    };
    expect(resolvePricingServiceRow(db, "standard-cleaning")).toEqual({ base: 2 });
    expect(resolvePricingServiceRow(db, "move-out")).toEqual({ base: 9 });
  });

  it("resolveMovingPricingSlug maps move types", () => {
    expect(resolveMovingPricingSlug("move_in")).toBe("move-in");
    expect(resolveMovingPricingSlug("move_out")).toBe("move-out");
    expect(resolveMovingPricingSlug("")).toBe("move");
  });
});

describe("PRINCESS PRA2 — service pricing matrix contracts", () => {
  it("every bookable service has an explicit contract", () => {
    const slugs = Object.keys(SERVICE_PRICING_CONTRACTS) as ServiceSlug[];
    expect(slugs).toEqual(
      expect.arrayContaining([
        "regular-cleaning",
        "deep-cleaning",
        "moving-cleaning",
        "office-cleaning",
        "carpet-cleaning",
        "airbnb-cleaning",
      ]),
    );
  });

  it("no price_and_duration field is left without a consumption note", () => {
    for (const contract of Object.values(SERVICE_PRICING_CONTRACTS)) {
      for (const field of contract.fields) {
        if (field.effect === "price_and_duration") {
          expect(field.consumedBy.length).toBeGreaterThan(3);
        }
      }
    }
  });
});

describe("PRINCESS PRA2 — Move-In / Move-Out room pricing", () => {
  it("move-in rooms change price and duration", () => {
    const small = calculateCustomerTotal(
      input(
        "moving-cleaning",
        { moveType: "move_in", bedrooms: "1", bathrooms: "1", extraRooms: "0", propertyType: "house" },
        {
          catalog: baseCatalog({ basePrice: 1050, pricePerBedroom: 110, pricePerBathroom: 95 }),
        },
      ),
    );
    const large = calculateCustomerTotal(
      input(
        "moving-cleaning",
        { moveType: "move_in", bedrooms: "8", bathrooms: "4", extraRooms: "2", propertyType: "house" },
        {
          catalog: baseCatalog({ basePrice: 1050, pricePerBedroom: 110, pricePerBathroom: 95, pricePerExtraRoom: 40 }),
        },
      ),
    );
    expect(large.bedrooms_price).toBe(880);
    expect(large.bathrooms_price).toBe(380);
    expect(large.estimated_total).toBeGreaterThan(small.estimated_total);
    expect(large.estimated_duration_minutes).toBeGreaterThan(small.estimated_duration_minutes);
  });

  it("move-out uses higher rates when catalog says so", () => {
    const moveIn = calculateCustomerTotal(
      input(
        "moving-cleaning",
        { moveType: "move_in", bedrooms: "2", bathrooms: "1", extraRooms: "0" },
        { catalog: baseCatalog({ basePrice: 1050, pricePerBedroom: 110, pricePerBathroom: 95 }) },
      ),
    );
    const moveOut = calculateCustomerTotal(
      input(
        "moving-cleaning",
        { moveType: "move_out", bedrooms: "2", bathrooms: "1", extraRooms: "0", furnished: "yes" },
        { catalog: baseCatalog({ basePrice: 1200, pricePerBedroom: 130, pricePerBathroom: 110 }) },
      ),
    );
    expect(moveOut.base_service_price).toBe(1200);
    expect(moveOut.bedrooms_price).toBe(260);
    expect(moveOut.estimated_total).toBeGreaterThan(moveIn.estimated_total);
  });
});

describe("PRINCESS PRA2 — Office frequency Model C", () => {
  it("frequency does not change per-visit price", () => {
    const once = calculateCustomerTotal(
      input("office-cleaning", {
        officeType: "open_plan",
        officeSize: "medium",
        bathrooms: "2",
        frequency: "once_off",
        afterHours: "after_hours",
      }),
    );
    const daily = calculateCustomerTotal(
      input("office-cleaning", {
        officeType: "open_plan",
        officeSize: "medium",
        bathrooms: "2",
        frequency: "daily",
        afterHours: "after_hours",
      }),
    );
    expect(daily.estimated_total).toBe(once.estimated_total);
    expect(daily.property_factors_total).toBe(once.property_factors_total);
  });

  it("office size and bathrooms do change price and duration", () => {
    const small = calculateCustomerTotal(
      input("office-cleaning", {
        officeSize: "small",
        bathrooms: "1",
        frequency: "weekly",
      }),
    );
    const large = calculateCustomerTotal(
      input("office-cleaning", {
        officeSize: "enterprise",
        bathrooms: "4",
        frequency: "weekly",
      }),
    );
    expect(large.estimated_total).toBeGreaterThan(small.estimated_total);
    expect(large.estimated_duration_minutes).toBeGreaterThan(small.estimated_duration_minutes);
  });
});

describe("PRINCESS PRA2 — Carpet rooms / rugs / sofa Extra", () => {
  it("carpetRooms and rugCount change price and duration", () => {
    const one = calculateCustomerTotal(
      input("carpet-cleaning", {
        carpetRooms: "1",
        rugCount: "0",
        carpetType: "standard",
        stains: "no",
        propertyType: "apartment",
      }),
    );
    const many = calculateCustomerTotal(
      input("carpet-cleaning", {
        carpetRooms: "4",
        rugCount: "3",
        carpetType: "thick_pile",
        stains: "yes",
        propertyType: "house",
      }),
    );
    expect(one.property_size_price).toBe(200);
    expect(many.property_size_price).toBeGreaterThan(one.property_size_price);
    expect(many.estimated_duration_minutes).toBeGreaterThan(one.estimated_duration_minutes);
  });

  it("sofa-upholstery Extra prices; legacy sofaCount still prices", () => {
    const withExtra = calculateCustomerTotal(
      input(
        "carpet-cleaning",
        { carpetRooms: "1", rugCount: "0", carpetType: "standard", stains: "no" },
        { selectedExtras: ["sofa-upholstery"] },
      ),
    );
    expect(withExtra.selected_extras_total).toBe(250);

    const legacy = calculateCustomerTotal(
      input("carpet-cleaning", {
        carpetRooms: "1",
        rugCount: "0",
        sofaCount: "2",
        carpetType: "standard",
        stains: "no",
      }),
    );
    expect(legacy.factorLines?.some((l) => l.key === "sofaCount")).toBe(true);
    expect(legacy.property_size_price).toBeGreaterThan(200);
  });
});

describe("PRINCESS PRA2 — Airbnb room pricing", () => {
  it("bedrooms and bathrooms change price and duration", () => {
    const small = calculateCustomerTotal(
      input(
        "airbnb-cleaning",
        { bedrooms: "1", bathrooms: "1", extraRooms: "0", propertyType: "apartment", linens: "no_change" },
        { catalog: baseCatalog({ basePrice: 400, pricePerBedroom: 70, pricePerBathroom: 55 }) },
      ),
    );
    const large = calculateCustomerTotal(
      input(
        "airbnb-cleaning",
        { bedrooms: "6", bathrooms: "3", extraRooms: "1", propertyType: "house", linens: "change" },
        {
          catalog: baseCatalog({
            basePrice: 400,
            pricePerBedroom: 70,
            pricePerBathroom: 55,
            pricePerExtraRoom: 25,
          }),
        },
      ),
    );
    expect(large.bedrooms_price).toBe(420);
    expect(large.bathrooms_price).toBe(165);
    expect(large.estimated_total).toBeGreaterThan(small.estimated_total);
    expect(large.estimated_duration_minutes).toBeGreaterThan(small.estimated_duration_minutes);
  });

  it("linens is informational — laundry Extra remains distinct", () => {
    const a = calculateCustomerTotal(
      input(
        "airbnb-cleaning",
        { bedrooms: "2", bathrooms: "1", linens: "change" },
        { catalog: baseCatalog({ basePrice: 400, pricePerBedroom: 70, pricePerBathroom: 55 }) },
      ),
    );
    const b = calculateCustomerTotal(
      input(
        "airbnb-cleaning",
        { bedrooms: "2", bathrooms: "1", linens: "no_change" },
        { catalog: baseCatalog({ basePrice: 400, pricePerBedroom: 70, pricePerBathroom: 55 }) },
      ),
    );
    expect(a.estimated_total).toBe(b.estimated_total);
    const withLaundry = calculateCustomerTotal(
      input(
        "airbnb-cleaning",
        { bedrooms: "2", bathrooms: "1", linens: "no_change" },
        {
          catalog: baseCatalog({ basePrice: 400, pricePerBedroom: 70, pricePerBathroom: 55 }),
          selectedExtras: ["laundry"],
        },
      ),
    );
    expect(withLaundry.estimated_total).toBe(b.estimated_total + 150);
  });
});

describe("PRINCESS PRA2 — duration label + quote consumption", () => {
  it("formats Estimated cleaning time label from server minutes", () => {
    expect(formatEstimatedCleaningTimeLabel(240)).toBe("Estimated cleaning time: 4 hours");
    expect(formatEstimatedCleaningTimeLabel(90)).toBe("Estimated cleaning time: 1.5 hours");
  });

  it("consumption guard passes for a complete regular quote", () => {
    const quoteInput = input("regular-cleaning", {
      propertyType: "house",
      bedrooms: "2",
      bathrooms: "1",
      extraRooms: "0",
      hasPets: "no",
    });
    const breakdown = calculateCustomerTotal(quoteInput);
    const result = assertQuotePricingInputsConsumed({
      serviceSlug: "regular-cleaning",
      quoteInput,
      breakdown,
      canonicalPricingKey: "standard",
    });
    expect(result.ok).toBe(true);
  });

  it("consumption guard fails when duration is missing", () => {
    const quoteInput = input("regular-cleaning", {
      propertyType: "house",
      bedrooms: "2",
      bathrooms: "1",
    });
    const breakdown = calculateCustomerTotal(quoteInput);
    const result = assertQuotePricingInputsConsumed({
      serviceSlug: "regular-cleaning",
      quoteInput,
      breakdown: { ...breakdown, estimated_duration_minutes: 0 },
      canonicalPricingKey: "standard",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("quote_duration_failed");
  });
});

describe("PRINCESS PRA2 — Paystack cancel recovery contracts", () => {
  it("Step4Payment persists pendingBookingId in form draft (static contract)", () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const src = readFileSync(
      join(process.cwd(), "src/features/booking-v2/steps/Step4Payment.tsx"),
      "utf8",
    );
    expect(src).toContain('setValue("pendingBookingId"');
    expect(src).toContain("PAYMENT_BOOKING_NOT_FOUND");
    expect(src).toContain("Your booking is saved");
    expect(src).toContain("expiresSoon");
    expect(src).toContain("confirmRes.status === 401");
    expect(src).toContain("sessRes.status === 401");
    expect(src).toContain("if (!requiresPayment)");
    expect(src).toContain("Boolean(pendingBookingId) || quoteReadiness.ready");
    expect(src).toContain("if (!pendingBookingId && !quoteReadiness.ready)");
    expect(src).toContain("Retry secure payment");
    expect(src).toContain("setPendingBookingId(null);");
    expect(src).toContain('quoteReadiness.message ?? "Your quote is not ready. Please refresh pricing."');
  });

  it("ensureBookingPaymentSession callback returns to /pay/{id}", () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const src = readFileSync(join(process.cwd(), "lib/booking/ensureBookingPaymentSession.ts"), "utf8");
    expect(src).toContain("/pay/");
    expect(src).not.toMatch(/callback_url: `\$\{appUrl\}\/account\/success`/);
  });

  it("payment-session supports owner retry without reference (idempotent path)", () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const src = readFileSync(
      join(process.cwd(), "app/api/bookings/[id]/payment-session/route.ts"),
      "utf8",
    );
    expect(src).toContain('kind: "owner"');
    expect(src).toContain("ensureBookingPaymentSession");
  });
});
