import { describe, expect, it } from "vitest";
import {
  buildExactSourceLineItems,
  buildHomeWidgetCatalogLineItems,
  buildMonthlyBundledZarLineItems,
  zarToCents,
} from "@/lib/booking/buildBookingLineItems";
import { computeJobSubtotalZarSnapshot } from "@/lib/pricing/pricingEngineSnapshot";
import { normalizePricingJobInput, type PricingJobInput } from "@/lib/pricing/pricingEngine";
import { vitestTestPricingRatesSnapshot } from "@/lib/pricing/testPricingSnapshot";

describe("buildHomeWidgetCatalogLineItems", () => {
  const snap = vitestTestPricingRatesSnapshot();

  it("sums to job subtotal (integer ZAR) for standard 2bd/1ba no extras", () => {
    const job: PricingJobInput = {
      service: "standard",
      rooms: 2,
      bathrooms: 1,
      extraRooms: 0,
      extras: [],
    };
    const j = normalizePricingJobInput(job);
    const expectedZar = Math.round(computeJobSubtotalZarSnapshot(snap, j));
    const lines = buildHomeWidgetCatalogLineItems({
      snapshot: snap,
      widgetService: "standard",
      bedrooms: 2,
      bathrooms: 1,
      extraRooms: 0,
      extraSlugs: [],
    });
    const sumCents = lines.reduce((s, r) => s + r.total_price_cents, 0);
    expect(sumCents).toBe(zarToCents(expectedZar));
  });

  it("handles bundle discount on extras for deep service", () => {
    const extras = ["carpet-cleaning", "mattress-cleaning"] as const;
    const job: PricingJobInput = {
      service: "deep",
      rooms: 1,
      bathrooms: 1,
      extraRooms: 0,
      extras: [...extras],
    };
    const j = normalizePricingJobInput(job);
    const expectedZar = Math.round(computeJobSubtotalZarSnapshot(snap, j));
    const lines = buildHomeWidgetCatalogLineItems({
      snapshot: snap,
      widgetService: "deep",
      bedrooms: 1,
      bathrooms: 1,
      extraRooms: 0,
      extraSlugs: extras,
    });
    const sumCents = lines.reduce((s, r) => s + r.total_price_cents, 0);
    expect(sumCents).toBe(zarToCents(expectedZar));
    expect(lines.some((r) => r.item_type === "adjustment" && r.name.includes("Bundle"))).toBe(true);
  });
});

describe("buildMonthlyBundledZarLineItems", () => {
  it("splits base vs extras to quoted total", () => {
    const lines = buildMonthlyBundledZarLineItems({
      quotedTotalZar: 500,
      bundleLabel: "Monthly",
      extras: [
        { slug: "inside-oven", name: "Oven", price: 50 },
        { slug: "inside-fridge", name: "Fridge", price: 50 },
      ],
    });
    const sumCents = lines.reduce((s, r) => s + r.total_price_cents, 0);
    expect(sumCents).toBe(500 * 100);
    expect(lines.filter((r) => r.item_type === "extra")).toHaveLength(2);
    const base = lines.find((r) => r.item_type === "base");
    expect(base?.total_price_cents).toBe(400 * 100);
  });
});

describe("buildExactSourceLineItems", () => {
  it("preserves source rows and reconciles their sum to the declared booking total", () => {
    const lines = buildExactSourceLineItems({
      declaredTotalCents: 35_050,
      source: "sales_document",
      lines: [
        { name: "Standard clean", quantity: 1, unitPriceCents: 25_000 },
        { name: "Oven", quantity: 2, unitPriceCents: 5_000 },
      ],
    });

    expect(lines.slice(0, 2)).toMatchObject([
      { item_type: "base", name: "Standard clean", total_price_cents: 25_000 },
      { item_type: "extra", name: "Oven", quantity: 2, total_price_cents: 10_000 },
    ]);
    expect(lines.at(-1)).toMatchObject({
      item_type: "adjustment",
      total_price_cents: 50,
    });
    expect(lines.reduce((sum, line) => sum + line.total_price_cents, 0)).toBe(35_050);
  });

  it("creates a canonical fallback line when a source has no usable rows", () => {
    expect(buildExactSourceLineItems({
      declaredTotalCents: 12_300,
      source: "recurring_occurrence",
      lines: [],
    })).toEqual([
      expect.objectContaining({
        item_type: "base",
        name: "Service total",
        total_price_cents: 12_300,
      }),
    ]);
  });
});
