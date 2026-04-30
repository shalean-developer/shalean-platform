import { describe, expect, it } from "vitest";
import {
  allocateDisplayCentsAcrossLineItems,
  sumEligibleLineItemsSubtotalCents,
} from "@/lib/payout/computeEarningsFromLineItems";

describe("sumEligibleLineItemsSubtotalCents", () => {
  it("sums eligible types only", () => {
    expect(
      sumEligibleLineItemsSubtotalCents([
        { id: "1", item_type: "base", total_price_cents: 100 },
        { id: "2", item_type: "extra", total_price_cents: 50 },
        { id: "3", item_type: "adjustment", total_price_cents: -10 },
      ]),
    ).toBe(140);
  });
});

describe("allocateDisplayCentsAcrossLineItems", () => {
  it("allocates display cents to match total", () => {
    const items = [
      { id: "a", item_type: "base", total_price_cents: 100 },
      { id: "b", item_type: "extra", total_price_cents: 100 },
    ];
    const out = allocateDisplayCentsAcrossLineItems(70, items);
    expect(out.reduce((s, r) => s + r.allocated_display_earnings_cents, 0)).toBe(70);
  });
});
