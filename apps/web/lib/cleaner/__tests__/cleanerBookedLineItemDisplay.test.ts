import { describe, expect, it } from "vitest";
import { cleanerBookedLineItemPresentation } from "@/lib/cleaner/cleanerBookedLineItemDisplay";

describe("cleaner booked line item presentation", () => {
  it("removes Office authoritative-backfill provenance and humanizes the service slug", () => {
    expect(
      cleanerBookedLineItemPresentation({
        item_type: "base",
        slug: null,
        name: "office-cleaning (authoritative subtotal backfill)",
        quantity: 1,
      }),
    ).toEqual({ label: "Office Cleaning", category: "Service" });
  });

  it("hides the company-only service-fee backfill row from cleaner booked scope", () => {
    expect(
      cleanerBookedLineItemPresentation({
        item_type: "adjustment",
        slug: "service-fee",
        name: "Service fee (backfill)",
        quantity: 1,
      }),
    ).toBeNull();
  });

  it("removes scope provenance while keeping a friendly bathroom label", () => {
    expect(
      cleanerBookedLineItemPresentation({
        item_type: "bathroom",
        slug: null,
        name: "Bathrooms (scope)",
        quantity: 1,
      }),
    ).toEqual({ label: "Bathrooms", category: "Bathroom" });
  });

  it("keeps normal extra names intact", () => {
    expect(
      cleanerBookedLineItemPresentation({
        item_type: "extra",
        slug: "balcony-cleaning",
        name: "Balcony cleaning",
        quantity: 1,
      }),
    ).toEqual({ label: "Balcony cleaning", category: "Extra" });
  });

  it("removes generic base provenance without changing a friendly service name", () => {
    expect(
      cleanerBookedLineItemPresentation({
        item_type: "base",
        slug: "moving-cleaning",
        name: "Moving Cleaning (base)",
        quantity: 1,
      }),
    ).toEqual({ label: "Moving Cleaning", category: "Service" });
  });
});
