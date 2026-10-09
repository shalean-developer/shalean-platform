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
    expect(result.items.find((line) => line.name === "Bedrooms")).toMatchObject({
      item_type: "room",
      quantity: 2,
      unit_price_cents: 15_000,
      total_price_cents: 30_000,
    });
    expect(result.items.find((line) => line.name === "Bathrooms")).toMatchObject({
      item_type: "bathroom",
      quantity: 2,
      unit_price_cents: 20_000,
      total_price_cents: 40_000,
    });
    expect(result.items.find((line) => line.name === "Extra rooms")).toMatchObject({
      item_type: "room",
      slug: "extra-rooms",
      quantity: 3,
      unit_price_cents: 12_000,
      total_price_cents: 36_000,
    });
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

  it("reconstructs B1 e865 exact R2530 ledger with known extra slugs", () => {
    const result = buildHistoricalTeamFinancialLedger({
      bookingId: "e865f74b-33af-481f-a12e-576e1e0ed227",
      totalPaidZar: 2530,
      amountPaidCents: 253000,
      bookingSnapshot: {
        pricingSummary: {
          lineItems: [
            { label: "Deep Cleaning (base)", amountZar: 1200 },
            { label: "2 bedrooms", amountZar: 300 },
            { label: "2 bathrooms", amountZar: 400 },
            { label: "Property condition", amountZar: 100 },
            { label: "Balcony cleaning", amountZar: 50 },
            { label: "Ceiling cleaning", amountZar: 100 },
            { label: "Outside windows", amountZar: 350 },
            { label: "Service fee", amountZar: 30 },
          ],
          selected_extras: [
            { name: "Balcony cleaning", price: 50, extra_id: "balcony-cleaning" },
            { name: "Ceiling cleaning", price: 100, extra_id: "ceiling-cleaning" },
            { name: "Outside windows", price: 350, extra_id: "outside-windows" },
          ],
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sourceLineTotalCents).toBe(253000);
    expect(result.items).toHaveLength(8);
    expect(result.items.every((line) => line.earns_cleaner === false)).toBe(true);
    expect(result.items.find((line) => line.name === "Balcony cleaning")?.slug).toBe("balcony-cleaning");
    expect(result.items.find((line) => line.name === "Ceiling cleaning")?.slug).toBe("ceiling-cleaning");
    expect(result.items.find((line) => line.name === "Outside windows")?.slug).toBe("outside-windows");
    expect(result.items.find((line) => line.name === "Bedrooms")).toMatchObject({
      quantity: 2,
      unit_price_cents: 15_000,
      total_price_cents: 30_000,
    });
    expect(result.items.find((line) => line.name === "Bathrooms")).toMatchObject({
      quantity: 2,
      unit_price_cents: 20_000,
      total_price_cents: 40_000,
    });
  });

  it("reconstructs B2 d2cf exact R1950 moving ledger with paid team payouts", () => {
    const result = buildHistoricalTeamFinancialLedger({
      bookingId: "d2cfcb8d-118f-48cc-90c7-420ffe122c9b",
      totalPaidZar: 1950,
      amountPaidCents: 195000,
      bookingSnapshot: {
        pricingSummary: {
          lineItems: [
            { label: "Moving Cleaning (base)", amountZar: 1200 },
            { label: "2 bedrooms", amountZar: 200 },
            { label: "3 bathrooms", amountZar: 450 },
            { label: "Furnished property", amountZar: 50 },
            { label: "Inside oven", amountZar: 20 },
            { label: "Service fee", amountZar: 30 },
          ],
          selected_extras: [{ name: "Inside oven", price: 20, extra_id: "inside-oven" }],
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sourceLineTotalCents).toBe(195000);
    expect(result.items).toHaveLength(6);
    expect(result.items.every((line) => line.earns_cleaner === false)).toBe(true);
    expect(result.items.find((line) => line.name === "Inside oven")?.slug).toBe("inside-oven");
    expect(result.items.find((line) => line.name === "Bedrooms")).toMatchObject({
      quantity: 2,
      unit_price_cents: 10_000,
      total_price_cents: 20_000,
    });
    expect(result.items.find((line) => line.name === "Bathrooms")).toMatchObject({
      quantity: 3,
      unit_price_cents: 15_000,
      total_price_cents: 45_000,
    });
    expect(result.items.find((line) => line.name === "Furnished property")?.item_type).toBe("adjustment");
  });

  it("reconstructs B3 c1bd exact R1819 ledger and preserves negative discount", () => {
    const result = buildHistoricalTeamFinancialLedger({
      bookingId: "c1bd1fc8-03e9-4f2c-a597-e0ac395c841a",
      totalPaidZar: 1819,
      amountPaidCents: 181900,
      bookingSnapshot: {
        pricingSummary: {
          lineItems: [
            { label: "Deep Cleaning (base)", amountZar: 1200 },
            { label: "3 bedrooms", amountZar: 450 },
            { label: "2 bathrooms", amountZar: 400 },
            { label: "Inside cabinets", amountZar: 25 },
            { label: "Interior walls", amountZar: 35 },
            { label: "Service fee", amountZar: 30 },
            { label: "15% discount", amountZar: -321 },
          ],
          selected_extras: [
            { name: "Inside cabinets", price: 25, extra_id: "inside-cabinets" },
            { name: "Interior walls", price: 35, extra_id: "interior-walls" },
          ],
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sourceLineTotalCents).toBe(181900);
    expect(result.items).toHaveLength(7);
    expect(result.items.every((line) => line.earns_cleaner === false)).toBe(true);
    expect(result.items.find((line) => line.name === "Inside cabinets")?.slug).toBe("inside-cabinets");
    expect(result.items.find((line) => line.name === "Interior walls")?.slug).toBe("interior-walls");
    expect(result.items.find((line) => line.name === "15% discount")).toMatchObject({
      item_type: "adjustment",
      quantity: 1,
      unit_price_cents: -32_100,
      total_price_cents: -32_100,
      earns_cleaner: false,
    });
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
