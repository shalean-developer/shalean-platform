import { describe, expect, it } from "vitest";
import { buildHistoricalTeamFinancialLedger } from "@/lib/booking/buildHistoricalTeamFinancialLedger";

describe("buildHistoricalTeamFinancialLedger", () => {
  it("reconstructs the Sep 26 deep-cleaning team quote exactly without affecting cleaner earnings", () => {
    const result = buildHistoricalTeamFinancialLedger({
      bookingId: "d860554e-c132-477b-bf15-557fb9c88a5e",
      totalPaidZar: 2420,
      amountPaidCents: 242000,
      bookingSnapshot: {
        pricingSummary: {
          lineItems: [
            { label: "Deep Cleaning (base)", amountZar: 1200 },
            { label: "2 bedrooms", amountZar: 300 },
            { label: "2 bathrooms", amountZar: 400 },
            { label: "3 extra rooms", amountZar: 360 },
            { label: "Property condition", amountZar: 100 },
            { label: "Service fee", amountZar: 60 },
          ],
          selected_extras: [],
        },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sourceLineTotalCents).toBe(242000);
    expect(result.items).toHaveLength(6);
    expect(result.items.every((line) => line.earns_cleaner === false)).toBe(true);
    expect(result.items.find((line) => line.name === "Service fee")?.item_type).toBe("adjustment");
  });

  it("preserves the Sep 13 known extra slug and exact R2730 payable", () => {
    const result = buildHistoricalTeamFinancialLedger({
      bookingId: "f6b2316e-2518-4f43-b6e8-b050c6d07483",
      totalPaidZar: 2730,
      amountPaidCents: 273000,
      bookingSnapshot: {
        pricingSummary: {
          lineItems: [
            { label: "Deep Cleaning (base)", amountZar: 1200 },
            { label: "1 bedroom", amountZar: 150 },
            { label: "3 bathrooms", amountZar: 600 },
            { label: "3 extra rooms", amountZar: 360 },
            { label: "Property condition", amountZar: 40 },
            { label: "Outside windows", amountZar: 350 },
            { label: "Service fee", amountZar: 30 },
          ],
          selected_extras: [{ name: "Outside windows", price: 350, extra_id: "outside-windows" }],
        },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sourceLineTotalCents).toBe(273000);
    expect(result.items.find((line) => line.name === "Outside windows")?.slug).toBe("outside-windows");
    expect(result.items.every((line) => line.earns_cleaner === false)).toBe(true);
  });

  it("fails closed when immutable lines do not reconcile to paid cents", () => {
    const result = buildHistoricalTeamFinancialLedger({
      bookingId: "00000000-0000-4000-8000-000000000001",
      totalPaidZar: 500,
      amountPaidCents: 50000,
      bookingSnapshot: { pricingSummary: { lineItems: [{ label: "Service", amountZar: 450 }] } },
    });
    expect(result).toEqual({
      ok: false,
      error: "Immutable source lines sum to 45000 cents, expected 50000.",
    });
  });
});
