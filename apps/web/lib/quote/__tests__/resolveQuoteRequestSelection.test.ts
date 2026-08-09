import { describe, expect, it } from "vitest";

import { resolveQuoteRequestSelection } from "@/lib/quote/resolveQuoteRequestSelection";
import type { QuotePublicService } from "@/lib/quote/types";

const services: QuotePublicService[] = [
  {
    id: "svc-1",
    slug: "office",
    name: "Office cleaning",
    extras: [{ id: "ext-1", slug: "inside-oven", name: "Inside oven", is_popular: true }],
  },
  { id: "svc-2", slug: "standard", name: "Standard cleaning", extras: [] },
];

describe("resolveQuoteRequestSelection", () => {
  it("rebuilds names and quantities from the canonical catalog", () => {
    expect(
      resolveQuoteRequestSelection({
        requested: [
          { kind: "service", slug: "office", name: "Injected", quantity: 99 },
          { kind: "extra", slug: "inside-oven", name: "Free oven", quantity: 99 },
        ],
        services,
        bedrooms: 2,
        bathrooms: 1,
      }),
    ).toEqual([
      { kind: "service", slug: "office", name: "Office cleaning (2 bed, 1 bath)", quantity: 1 },
      { kind: "extra", slug: "inside-oven", name: "Inside oven", quantity: 1 },
    ]);
  });

  it("rejects unknown or incompatible selections", () => {
    expect(
      resolveQuoteRequestSelection({
        requested: [
          { kind: "service", slug: "office", name: "Office", quantity: 1 },
          { kind: "extra", slug: "garage", name: "Garage", quantity: 1 },
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

  it("keeps the recommend-for-me custom path without accepting extras", () => {
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
  });

  it("routes instant-priced services away from manual quote intake", () => {
    expect(
      resolveQuoteRequestSelection({
        requested: [{ kind: "service", slug: "standard", name: "Standard", quantity: 1 }],
        services,
        bedrooms: 2,
        bathrooms: 1,
      }),
    ).toBeNull();
  });
});
