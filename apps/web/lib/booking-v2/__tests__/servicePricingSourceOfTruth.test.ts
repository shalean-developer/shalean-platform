import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveBookingV2PricingServiceRow } from "@/lib/booking-v2/resolvePricingServiceSlug";

describe("SR-04B service pricing source of truth", () => {
  it("resolves only the requested service pricing row", () => {
    const db = {
      standard: { base: 350 },
      deep: { base: 950 },
      airbnb: { base: 400 },
    };

    expect(resolveBookingV2PricingServiceRow(db, "regular-cleaning")).toEqual({ base: 350 });
    expect(resolveBookingV2PricingServiceRow(db, "deep-cleaning")).toEqual({ base: 950 });
    expect(resolveBookingV2PricingServiceRow(db, "airbnb-cleaning")).toEqual({ base: 400 });
  });

  it("does not borrow Standard pricing when another service row is missing", () => {
    const db = { standard: { base: 350 } };

    expect(resolveBookingV2PricingServiceRow(db, "deep-cleaning")).toBeNull();
    expect(resolveBookingV2PricingServiceRow(db, "office-cleaning")).toBeNull();
    expect(resolveBookingV2PricingServiceRow(db, "carpet-cleaning")).toBeNull();
    expect(resolveBookingV2PricingServiceRow(db, "airbnb-cleaning")).toBeNull();
  });

  it("allows Moving to fall back only within its own move pricing family", () => {
    expect(resolveBookingV2PricingServiceRow({ move: { base: 1100 } }, "moving-cleaning")).toEqual({ base: 1100 });
    expect(resolveBookingV2PricingServiceRow({ standard: { base: 350 } }, "moving-cleaning")).toBeNull();
  });

  it("preserves configured aliases that belong to the same service family", () => {
    const officeDb = { quick: { base: 700 } };
    const moveDb = { "move-out": { base: 1250 }, move: { base: 1100 } };

    expect(resolveBookingV2PricingServiceRow(officeDb, "office-cleaning", "quick")).toEqual({ base: 700 });
    expect(resolveBookingV2PricingServiceRow(moveDb, "moving-cleaning", "move-out")).toEqual({ base: 1250 });
  });

  it("ignores cross-service configured pricing and stays in the requested service family", () => {
    const db = {
      standard: { base: 350 },
      deep: { base: 950 },
    };

    expect(resolveBookingV2PricingServiceRow(db, "deep-cleaning", "standard")).toEqual({ base: 950 });
    expect(resolveBookingV2PricingServiceRow({ standard: { base: 350 } }, "deep-cleaning", "standard")).toBeNull();
  });

  it("keeps the catalog loader free of cross-service Standard fallback while preserving configured pricingSlug", () => {
    const loader = readFileSync(path.resolve(__dirname, "../loadBookingV2Catalog.ts"), "utf8");
    expect(loader).toContain("resolveBookingV2PricingServiceRow(dbServices, slug, serviceDef.pricingSlug)");
    expect(loader).toContain("resolveBookingV2PricingServiceRow(dbServices, slug)");
    expect(loader).not.toContain('resolvePricingServiceRow(dbServices, "standard")');
  });
});
