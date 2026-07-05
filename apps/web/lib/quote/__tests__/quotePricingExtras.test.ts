import { describe, expect, it } from "vitest";

import {
  buildQuoteSelectedItems,
  extrasForSelectedService,
  QUOTE_UNSURE_SERVICE_SLUG,
  quoteServiceShowsExtras,
} from "@/lib/quote/quoteSelection";
import {
  extraTypesForPricingServiceSlug,
  filterExtrasForPricingService,
} from "@/lib/quote/quotePricingExtras";

const DB_EXTRAS = [
  { id: "1", slug: "inside-oven", name: "Inside oven", service_type: "light", is_popular: true, sort_order: 20 },
  { id: "2", slug: "balcony-cleaning", name: "Balcony cleaning", service_type: "heavy", is_popular: false, sort_order: 90 },
  { id: "3", slug: "carpet-cleaning", name: "Carpet cleaning", service_type: "heavy", is_popular: true, sort_order: 100 },
  { id: "4", slug: "extra-cleaner", name: "Extra cleaner", service_type: "all", is_popular: false, sort_order: 150 },
  { id: "5", slug: "laundry", name: "Laundry", service_type: "light", is_popular: false, sort_order: 60 },
];

describe("extraTypesForPricingServiceSlug", () => {
  it("maps standard to light and all add-on types", () => {
    expect(extraTypesForPricingServiceSlug("standard")).toEqual(["light", "all"]);
  });

  it("maps deep to heavy and all add-on types", () => {
    expect(extraTypesForPricingServiceSlug("deep")).toEqual(["heavy", "all"]);
  });
});

describe("filterExtrasForPricingService", () => {
  it("returns light add-ons for standard cleaning", () => {
    const rows = filterExtrasForPricingService("standard", DB_EXTRAS);
    expect(rows.map((row) => row.slug)).toEqual(["inside-oven", "laundry"]);
  });

  it("returns heavy add-ons for deep cleaning", () => {
    const rows = filterExtrasForPricingService("deep", DB_EXTRAS);
    expect(rows.map((row) => row.slug)).toEqual(["balcony-cleaning", "carpet-cleaning"]);
  });

  it("hides internal booking extras from quote add-ons", () => {
    const rows = filterExtrasForPricingService("standard", DB_EXTRAS);
    expect(rows.some((row) => row.slug === "extra-cleaner")).toBe(false);
  });
});

describe("buildQuoteSelectedItems", () => {
  const services = [
    {
      id: "svc-1",
      slug: "standard",
      name: "Standard Cleaning",
      extras: [
        { id: "1", slug: "inside-oven", name: "Inside oven", is_popular: true },
        { id: "5", slug: "laundry", name: "Laundry", is_popular: false },
      ],
    },
  ];
  const extras = DB_EXTRAS;

  it("builds a service line with home size and allowed extras only", () => {
    const items = buildQuoteSelectedItems({
      primaryServiceSlug: "standard",
      services,
      selectedExtraSlugs: ["inside-oven", "balcony-cleaning"],
      extras,
      bedrooms: 2,
      bathrooms: 1,
      includeHomeSize: true,
    });

    expect(items).toEqual([
      {
        kind: "service",
        slug: "standard",
        name: "Standard Cleaning (2 bed, 1 bath)",
        quantity: 1,
      },
      { kind: "extra", slug: "inside-oven", name: "Inside oven", quantity: 1 },
    ]);
  });

  it("supports unsure selection", () => {
    const items = buildQuoteSelectedItems({
      primaryServiceSlug: QUOTE_UNSURE_SERVICE_SLUG,
      services,
      selectedExtraSlugs: ["inside-oven"],
      extras,
      bedrooms: 2,
      bathrooms: 1,
      includeHomeSize: true,
    });

    expect(items[0]?.slug).toBe(QUOTE_UNSURE_SERVICE_SLUG);
    expect(items).toHaveLength(1);
  });
});

describe("extrasForSelectedService", () => {
  it("returns service-specific extras from catalog payload", () => {
    const services = [
      {
        id: "svc-1",
        slug: "standard",
        name: "Standard Cleaning",
        extras: [{ id: "1", slug: "inside-oven", name: "Inside oven", is_popular: true }],
      },
      {
        id: "svc-2",
        slug: "deep",
        name: "Deep Cleaning",
        extras: [{ id: "2", slug: "balcony-cleaning", name: "Balcony cleaning", is_popular: false }],
      },
    ];

    expect(extrasForSelectedService("standard", services).map((e) => e.slug)).toEqual(["inside-oven"]);
    expect(extrasForSelectedService("deep", services).map((e) => e.slug)).toEqual([]);
  });
});

describe("quoteServiceShowsExtras", () => {
  it("hides add-ons for deep and move services", () => {
    expect(quoteServiceShowsExtras("standard")).toBe(true);
    expect(quoteServiceShowsExtras("deep")).toBe(false);
    expect(quoteServiceShowsExtras("move")).toBe(false);
    expect(quoteServiceShowsExtras(QUOTE_UNSURE_SERVICE_SLUG)).toBe(false);
  });
});
