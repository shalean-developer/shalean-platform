import { describe, expect, it } from "vitest";
import {
  allocateDisplayCentsAcrossLineItems,
  sumEligibleLineItemsSubtotalCents,
} from "@/lib/payout/computeEarningsFromLineItems";

describe("sumEligibleLineItemsSubtotalCents", () => {
  it("sums eligible categories only", () => {
    expect(
      sumEligibleLineItemsSubtotalCents([
        { id: "1", item_type: "base", total_price_cents: 100 },
        { id: "2", item_type: "extra", slug: "inside-oven", total_price_cents: 50 },
        { id: "3", item_type: "adjustment", total_price_cents: -10 },
      ]),
    ).toBe(150);
  });

  it("excludes unsafe extras and generic adjustments from the cleaner earnings basis", () => {
    expect(
      sumEligibleLineItemsSubtotalCents([
        { id: "1", item_type: "base", total_price_cents: 20_000 },
        { id: "2", item_type: "extra", slug: "supplies-kit", total_price_cents: 3_990 },
        { id: "3", item_type: "extra", slug: "extra-cleaner", total_price_cents: 29_900 },
        { id: "4", item_type: "adjustment", name: "Surge, slot demand & fees", total_price_cents: 5_000 },
      ]),
    ).toBe(20_000);
  });
});

describe("allocateDisplayCentsAcrossLineItems", () => {
  it("allocates display cents to match total", () => {
    const items = [
      { id: "a", item_type: "base", total_price_cents: 100 },
      { id: "b", item_type: "extra", slug: "inside-fridge", total_price_cents: 100 },
    ];
    const out = allocateDisplayCentsAcrossLineItems(70, items);
    expect(out.reduce((s, r) => s + r.allocated_display_earnings_cents, 0)).toBe(70);
  });

  it("does not allocate display earnings onto ineligible fee lines", () => {
    const out = allocateDisplayCentsAcrossLineItems(70, [
      { id: "a", item_type: "base", total_price_cents: 100 },
      { id: "b", item_type: "adjustment", name: "Service fee", total_price_cents: 100 },
    ]);

    expect(out).toEqual([{ booking_line_item_id: "a", allocated_display_earnings_cents: 70 }]);
  });
});
