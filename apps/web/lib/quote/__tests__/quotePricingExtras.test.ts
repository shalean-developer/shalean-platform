import { describe, expect, it } from "vitest";

import {
  buildQuoteSelectedItems,
  extrasForSelectedService,
  extrasForSelectedServices,
  QUOTE_UNSURE_SERVICE_SLUG,
  quoteServiceShowsExtras,
} from "@/lib/quote/quoteSelection";
import { SERVICE_EXTRA_SLUGS } from "@/lib/booking-v2/serviceExtraSlugs";
import {
  extraTypesForPricingServiceSlug,
  filterExtrasForPricingService,
  QUOTE_PRICING_TO_BOOKING_V2,
} from "@/lib/quote/quotePricingExtras";

const DB_EXTRAS = [
  { id: "1", slug: "inside-oven", name: "Inside oven", service_type: "light", is_popular: true, sort_order: 20 },
  { id: "2", slug: "balcony-cleaning", name: "Balcony cleaning", service_type: "heavy", is_popular: false, sort_order: 90 },
  { id: "3", slug: "carpet-cleaning", name: "Carpet cleaning", service_type: "heavy", is_popular: true, sort_order: 100 },
  { id: "4", slug: "extra-cleaner", name: "Extra cleaner", service_type: "all", is_popular: false, sort_order: 150 },
  { id: "5", slug: "laundry", name: "Laundry", service_type: "light", is_popular: false, sort_order: 60 },
  { id: "6", slug: "office-kitchen", name: "Kitchen / break room", service_type: "light", is_popular: false, sort_order: 170 },
  { id: "7", slug: "stain-treatment", name: "Stain treatment", service_type: "heavy", is_popular: true, sort_order: 165 },
  { id: "8", slug: "welcome-setup", name: "Welcome setup", service_type: "light", is_popular: false, sort_order: 171 },
];

function allowedForPricingSlug(pricingSlug: keyof typeof QUOTE_PRICING_TO_BOOKING_V2) {
  const bookingSlug = QUOTE_PRICING_TO_BOOKING_V2[pricingSlug];
  const allowlist = new Set(SERVICE_EXTRA_SLUGS[bookingSlug]);
  return DB_EXTRAS.filter((extra) => allowlist.has(extra.slug)).map((extra) => extra.slug);
}

describe("extraTypesForPricingServiceSlug", () => {
  it("maps standard to light and all add-on types", () => {
    expect(extraTypesForPricingServiceSlug("standard")).toEqual(["light", "all"]);
  });

  it("maps deep to heavy and all add-on types", () => {
    expect(extraTypesForPricingServiceSlug("deep")).toEqual(["heavy", "all"]);
  });
});

describe("filterExtrasForPricingService", () => {
  it("returns regular-cleaning allowlist for standard", () => {
    const rows = filterExtrasForPricingService("standard", DB_EXTRAS);
    expect(rows.map((row) => row.slug)).toEqual(allowedForPricingSlug("standard"));
  });

  it("returns deep-cleaning allowlist for deep", () => {
    const rows = filterExtrasForPricingService("deep", DB_EXTRAS);
    expect(rows.map((row) => row.slug)).toEqual(allowedForPricingSlug("deep"));
  });

  it("returns office-cleaning allowlist for office/quick pricing slugs", () => {
    expect(filterExtrasForPricingService("quick", DB_EXTRAS).map((row) => row.slug)).toEqual(
      allowedForPricingSlug("quick"),
    );
    expect(filterExtrasForPricingService("office", DB_EXTRAS).map((row) => row.slug)).toEqual(
      allowedForPricingSlug("office"),
    );
  });

  it("returns carpet-cleaning allowlist for carpet pricing slug", () => {
    const rows = filterExtrasForPricingService("carpet", DB_EXTRAS);
    expect(rows.map((row) => row.slug)).toEqual(allowedForPricingSlug("carpet"));
  });

  it("returns airbnb-cleaning allowlist for airbnb pricing slug", () => {
    const rows = filterExtrasForPricingService("airbnb", DB_EXTRAS);
    expect(rows.map((row) => row.slug)).toEqual(allowedForPricingSlug("airbnb"));
  });

  it("maps each quote pricing slug to a distinct booking v2 service", () => {
    expect(Object.keys(QUOTE_PRICING_TO_BOOKING_V2).sort()).toEqual(
      ["airbnb", "carpet", "deep", "move", "office", "quick", "standard"].sort(),
    );
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

describe("extrasForSelectedServices", () => {
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
    {
      id: "svc-2",
      slug: "deep",
      name: "Deep Cleaning",
      extras: [{ id: "2", slug: "balcony-cleaning", name: "Balcony cleaning", is_popular: false }],
    },
    {
      id: "svc-3",
      slug: "office",
      name: "Office Cleaning",
      extras: [{ id: "6", slug: "office-kitchen", name: "Kitchen / break room", is_popular: false }],
    },
  ];

  it("returns service-specific add-ons", () => {
    expect(
      extrasForSelectedServices(["standard"], services, DB_EXTRAS).map((e) => e.slug),
    ).toEqual(["inside-oven", "laundry"]);
    expect(
      extrasForSelectedServices(["deep"], services, DB_EXTRAS).map((e) => e.slug),
    ).toEqual(["balcony-cleaning"]);
    expect(
      extrasForSelectedServices(["office"], services, DB_EXTRAS).map((e) => e.slug),
    ).toEqual(["office-kitchen"]);
  });

  it("unions add-ons when multiple services are selected", () => {
    expect(
      extrasForSelectedServices(["standard", "office"], services, DB_EXTRAS).map((e) => e.slug),
    ).toEqual(["inside-oven", "laundry", "office-kitchen"]);
  });

  it("returns empty when no services are selected", () => {
    expect(extrasForSelectedServices([], services, DB_EXTRAS)).toEqual([]);
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
    expect(extrasForSelectedService("deep", services).map((e) => e.slug)).toEqual(["balcony-cleaning"]);
  });
});

describe("quoteServiceShowsExtras", () => {
  it("shows add-ons for all catalog services except unsure", () => {
    expect(quoteServiceShowsExtras("standard")).toBe(true);
    expect(quoteServiceShowsExtras("deep")).toBe(true);
    expect(quoteServiceShowsExtras("move")).toBe(true);
    expect(quoteServiceShowsExtras("carpet")).toBe(true);
    expect(quoteServiceShowsExtras(QUOTE_UNSURE_SERVICE_SLUG)).toBe(false);
  });
});
