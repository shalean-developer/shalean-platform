import { describe, expect, it } from "vitest";

import { resolveQuoteRequestSelection } from "@/lib/quote/resolveQuoteRequestSelection";
import type { QuotePublicService } from "@/lib/quote/types";

const services: QuotePublicService[] = [
  {
    id: "svc-office",
    slug: "office",
    name: "Office Cleaning",
    extras: [{ id: "ext-office", slug: "office-kitchen", name: "Kitchen", is_popular: true }],
  },
  {
    id: "svc-standard",
    slug: "standard",
    name: "Regular Cleaning",
    extras: [{ id: "ext-standard", slug: "inside-oven", name: "Inside Oven", is_popular: true }],
  },
  {
    id: "svc-deep",
    slug: "deep",
    name: "Deep Cleaning",
    extras: [{ id: "ext-deep", slug: "garage-cleaning", name: "Garage cleaning", is_popular: false }],
  },
  {
    id: "svc-move",
    slug: "move",
    name: "Moving Cleaning",
    extras: [{ id: "ext-move", slug: "outside-windows", name: "Outside windows", is_popular: false }],
  },
  {
    id: "svc-carpet",
    slug: "carpet",
    name: "Carpet Cleaning",
    extras: [{ id: "ext-carpet", slug: "fabric-protector", name: "Fabric protector", is_popular: false }],
  },
  {
    id: "svc-airbnb",
    slug: "airbnb",
    name: "Airbnb Cleaning",
    extras: [{ id: "ext-airbnb", slug: "welcome-setup", name: "Welcome setup", is_popular: false }],
  },
];

describe("resolveQuoteRequestSelection", () => {
  it("rebuilds names and quantities from the canonical catalog", () => {
    expect(
      resolveQuoteRequestSelection({
        requested: [
          { kind: "service", slug: "office", name: "Injected", quantity: 99 },
          { kind: "extra", slug: "office-kitchen", name: "Free kitchen", quantity: 99 },
        ],
        services,
        bedrooms: 2,
        bathrooms: 1,
      }),
    ).toEqual([
      { kind: "service", slug: "office", name: "Office Cleaning (2 bed, 1 bath)", quantity: 1 },
      { kind: "extra", slug: "office-kitchen", name: "Kitchen", quantity: 1 },
    ]);
  });

  it("accepts all six booking service families for quote intake", () => {
    const allowed = ["standard", "deep", "move", "office", "carpet", "airbnb"];

    for (const slug of allowed) {
      const result = resolveQuoteRequestSelection({
        requested: [{ kind: "service", slug, name: "Injected", quantity: 7 }],
        services,
        bedrooms: 2,
        bathrooms: 1,
      });

      expect(result?.[0]?.slug).toBe(slug);
      expect(result?.[0]?.quantity).toBe(1);
    }
  });

  it("accepts only extras attached to the selected booking service", () => {
    expect(
      resolveQuoteRequestSelection({
        requested: [
          { kind: "service", slug: "standard", name: "Regular", quantity: 1 },
          { kind: "extra", slug: "inside-oven", name: "Injected oven", quantity: 1 },
        ],
        services,
        bedrooms: 2,
        bathrooms: 1,
      }),
    ).toEqual([
      { kind: "service", slug: "standard", name: "Regular Cleaning (2 bed, 1 bath)", quantity: 1 },
      { kind: "extra", slug: "inside-oven", name: "Inside Oven", quantity: 1 },
    ]);

    expect(
      resolveQuoteRequestSelection({
        requested: [
          { kind: "service", slug: "standard", name: "Regular", quantity: 1 },
          { kind: "extra", slug: "garage-cleaning", name: "Garage", quantity: 1 },
        ],
        services,
        bedrooms: 2,
        bathrooms: 1,
      }),
    ).toBeNull();
  });

  it("requires exactly one active service", () => {
    expect(
      resolveQuoteRequestSelection({ requested: [], services, bedrooms: null, bathrooms: null }),
    ).toBeNull();
  });

  it("keeps the recommend-for-me path without accepting extras", () => {
    expect(
      resolveQuoteRequestSelection({
        requested: [{ kind: "service", slug: "unsure", name: "Injected", quantity: 7 }],
        services,
        bedrooms: 3,
        bathrooms: 2,
      }),
    ).toEqual([
      {
        kind: "service",
        slug: "unsure",
        name: "Not sure — recommend for me (3 bed, 2 bath)",
        quantity: 1,
      },
    ]);

    expect(
      resolveQuoteRequestSelection({
        requested: [
          { kind: "service", slug: "unsure", name: "Injected", quantity: 1 },
          { kind: "extra", slug: "inside-oven", name: "Oven", quantity: 1 },
        ],
        services,
        bedrooms: 3,
        bathrooms: 2,
      }),
    ).toBeNull();
  });

  it("rejects unknown services", () => {
    expect(
      resolveQuoteRequestSelection({
        requested: [{ kind: "service", slug: "unknown", name: "Unknown", quantity: 1 }],
        services,
        bedrooms: 2,
        bathrooms: 1,
      }),
    ).toBeNull();
  });
});
