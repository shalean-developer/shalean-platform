import { describe, expect, it } from "vitest";

import { buildMonthlyInvoiceZohoLineItems } from "@/lib/monthlyInvoice/buildMonthlyInvoiceZohoLineItems";

describe("buildMonthlyInvoiceZohoLineItems", () => {
  it("returns a single line when there are no adjustments", () => {
    const lines = buildMonthlyInvoiceZohoLineItems({
      month: "2026-06",
      bookingsSumCents: 1_090_000,
      adjustments: [],
      totalAmountCents: 1_090_000,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.rate).toBe(10_900);
  });

  it("adds adjustment rows including cleaning detergents", () => {
    const lines = buildMonthlyInvoiceZohoLineItems({
      month: "2026-06",
      bookingsSumCents: 1_100_000,
      adjustments: [
        { amount_cents: 40_000, category: "cleaning_detergents", reason: "Cleaning detergents" },
        { amount_cents: -50_000, category: "other", reason: "Holiday of 16 June Youth Day" },
      ],
      totalAmountCents: 1_090_000,
    });

    expect(lines).toHaveLength(3);
    expect(lines[0]?.rate).toBe(11_000);
    expect(lines[1]).toMatchObject({ name: "Cleaning detergents", rate: 400 });
    expect(lines[2]?.rate).toBe(-500);
    expect(lines.reduce((sum, line) => sum + line.rate, 0)).toBe(10_900);
  });
});
