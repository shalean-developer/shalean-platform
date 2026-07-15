import { describe, expect, it } from "vitest";
import { locationLabelToSlug, normalizeLocationResolveSlug } from "@/lib/booking/resolveLocationId";
import { step1Schema } from "@/src/features/booking-v2/schemas";

describe("locationLabelToSlug (booking catalog parity)", () => {
  it("strips apostrophes like the booking suburb catalog", () => {
    expect(locationLabelToSlug("Devil's Peak Estate")).toBe("devils-peak-estate");
    expect(locationLabelToSlug("Simon's Town")).toBe("simons-town");
  });

  it("normalises aliases and mixed case / whitespace", () => {
    expect(normalizeLocationResolveSlug("  D'urbanvale ")).toBe("durbanville");
    expect(locationLabelToSlug("SEA POINT")).toBe("sea-point");
    expect(locationLabelToSlug("Claremont")).toBe("claremont");
  });

  it("treats Other as empty slug", () => {
    expect(locationLabelToSlug("Other")).toBe("");
    expect(normalizeLocationResolveSlug("other")).toBe("");
  });
});

describe("step1Schema service-area gate (UAT-BOOK-003/004)", () => {
  const base = {
    serviceDetails: {},
    address: "12 Ocean View Drive",
    suburb: "Claremont",
    serviceAreaCityId: "",
    city: "Cape Town",
    postalCode: "",
    accessInstructions: "",
    parkingInstructions: "",
    gateCode: "",
    contactPhone: "0821234567",
    selectedExtras: [],
    equipmentRequired: "no" as const,
    equipmentQuote: null,
  };

  it("rejects Step 1 without a resolved service-area UUID", () => {
    const result = step1Schema.safeParse({ ...base, serviceAreaLocationId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects free-text suburb labels as location identifiers", () => {
    const result = step1Schema.safeParse({ ...base, serviceAreaLocationId: "claremont" });
    expect(result.success).toBe(false);
  });

  it("accepts a valid supported suburb UUID", () => {
    const result = step1Schema.safeParse({
      ...base,
      serviceAreaLocationId: "00000000-0000-4000-8000-000000000010",
    });
    expect(result.success).toBe(true);
  });
});
