import { describe, expect, it } from "vitest";

import {
  inferServiceSlugFromLineItemDescriptions,
  resolveSalesDocumentBookingServiceSlug,
} from "@/lib/salesDocument/resolveSalesDocumentBookingServiceSlug";

describe("inferServiceSlugFromLineItemDescriptions", () => {
  it("detects deep cleaning from admin quote header lines", () => {
    expect(
      inferServiceSlugFromLineItemDescriptions(["Deep Cleaning Equipment and Team", "Boardrooms"]),
    ).toBe("deep");
  });

  it("detects move and carpet before standard fallback", () => {
    expect(inferServiceSlugFromLineItemDescriptions(["Move out clean — 3 bed"])).toBe("move");
    expect(inferServiceSlugFromLineItemDescriptions(["Carpet cleaning lounge"])).toBe("carpet");
  });

  it("returns null when no service hint is present", () => {
    expect(inferServiceSlugFromLineItemDescriptions(["Bedroom", "Bathroom"])).toBeNull();
  });
});

describe("resolveSalesDocumentBookingServiceSlug", () => {
  it("prefers structured customer request selection", () => {
    expect(
      resolveSalesDocumentBookingServiceSlug({
        requestDetails: {
          property_type: "house",
          bedrooms: 2,
          bathrooms: 1,
          suburb: "Sea Point",
          preferred_date: null,
          message: null,
          submitted_at: "2026-01-01T00:00:00.000Z",
          selected_items: [{ kind: "service", slug: "deep", name: "Deep Cleaning", quantity: 1 }],
        },
        lineItems: [{ description: "Standard clean", quantity: 1, unit_price_cents: 10000 }],
      }),
    ).toBe("deep");
  });

  it("falls back to admin line items when request_details is null", () => {
    expect(
      resolveSalesDocumentBookingServiceSlug({
        requestDetails: null,
        lineItems: [
          { description: "Deep Cleaning Equipment and Team", quantity: 1, unit_price_cents: 150000 },
          { description: "Boardrooms", quantity: 2, unit_price_cents: 30000 },
        ],
      }),
    ).toBe("deep");
  });

  it("defaults to standard when nothing matches", () => {
    expect(
      resolveSalesDocumentBookingServiceSlug({
        requestDetails: null,
        lineItems: [{ description: "Bedroom", quantity: 1, unit_price_cents: 15000 }],
      }),
    ).toBe("standard");
  });
});
