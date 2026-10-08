import { describe, expect, it } from "vitest";
import { buildBookingLineItemsFromRow } from "@/lib/booking/buildBookingLineItemsFromRow";
import { zarToCents } from "@/lib/booking/buildBookingLineItems";

describe("buildBookingLineItemsFromRow", () => {
  it("builds base + extras reconciled to total_paid_zar", () => {
    const items = buildBookingLineItemsFromRow({
      id: "00000000-0000-4000-8000-000000000001",
      service: "Standard Cleaning",
      rooms: 2,
      bathrooms: 1,
      extras: [
        { slug: "inside-oven", name: "Oven", price: 50 },
        { slug: "inside-fridge", name: "Fridge", price: 50 },
      ],
      total_paid_zar: 500,
      amount_paid_cents: null,
      booking_snapshot: null,
    });
    const sum = items.reduce((s, r) => s + r.total_price_cents, 0);
    expect(sum).toBe(zarToCents(500));
    expect(items.filter((r) => r.item_type === "extra")).toHaveLength(2);
    const base = items.find((r) => r.item_type === "base");
    expect(base?.total_price_cents).toBe(zarToCents(400));
  });

  it("uses authoritative visit subtotal for a fully covered R0 Booking V2 row", () => {
    const items = buildBookingLineItemsFromRow({
      id: "00000000-0000-4000-8000-000000000042",
      service: "Regular Cleaning",
      rooms: 2,
      bathrooms: 3,
      extras: [],
      total_paid_zar: 0,
      amount_paid_cents: 0,
      base_amount_cents: 65_000,
      service_fee_cents: 3_000,
      booking_snapshot: { serviceSlug: "regular-cleaning" },
    });

    const base = items.find((r) => r.item_type === "base");
    const fee = items.find((r) => r.slug === "service-fee");
    const eligibleTotal = items
      .filter((r) => r.earns_cleaner !== false && r.item_type !== "adjustment")
      .reduce((sum, r) => sum + r.total_price_cents, 0);
    const allTotal = items.reduce((sum, r) => sum + r.total_price_cents, 0);
    const reconciliation = items.find((r) => r.name === "Backfill payable reconciliation");

    expect(base?.total_price_cents).toBe(65_000);
    expect(fee?.item_type).toBe("adjustment");
    expect(fee?.earns_cleaner).toBe(false);
    expect(fee?.total_price_cents).toBe(3_000);
    expect(reconciliation?.earns_cleaner).toBe(false);
    expect(reconciliation?.total_price_cents).toBe(-68_000);
    expect(eligibleTotal).toBe(65_000);
    expect(allTotal).toBe(0);
  });

  it("does not double-count legacy extras when authoritative base already contains the visit subtotal", () => {
    const items = buildBookingLineItemsFromRow({
      id: "00000000-0000-4000-8000-000000000043",
      service: "Regular Cleaning",
      rooms: null,
      bathrooms: null,
      extras: [{ slug: "inside-oven", name: "Oven", price: 50 }],
      total_paid_zar: 0,
      amount_paid_cents: 0,
      base_amount_cents: 65_000,
      service_fee_cents: 3_000,
      booking_snapshot: null,
    });

    expect(items.filter((r) => r.item_type === "extra")).toHaveLength(0);
    const eligibleTotal = items
      .filter((r) => r.earns_cleaner !== false && r.item_type !== "adjustment")
      .reduce((sum, r) => sum + r.total_price_cents, 0);
    expect(eligibleTotal).toBe(65_000);
    expect(items.reduce((sum, r) => sum + r.total_price_cents, 0)).toBe(0);
  });

  it("adds a non-cleaner reconciliation line for referral-discounted authoritative subtotal backfill", () => {
    const items = buildBookingLineItemsFromRow({
      id: "00000000-0000-4000-8000-000000000044",
      service: "Regular Cleaning",
      rooms: 1,
      bathrooms: 1,
      extras: [],
      total_paid_zar: 310,
      amount_paid_cents: 31_000,
      base_amount_cents: 33_000,
      service_fee_cents: 3_000,
      booking_snapshot: null,
    });

    const reconciliation = items.find((r) => r.name === "Backfill payable reconciliation");
    const eligibleTotal = items
      .filter((r) => r.earns_cleaner !== false && r.item_type !== "adjustment")
      .reduce((sum, r) => sum + r.total_price_cents, 0);
    const allTotal = items.reduce((sum, r) => sum + r.total_price_cents, 0);

    expect(eligibleTotal).toBe(33_000);
    expect(reconciliation?.earns_cleaner).toBe(false);
    expect(reconciliation?.total_price_cents).toBe(-5_000);
    expect(allTotal).toBe(31_000);
  });

  it("returns empty when nothing to record", () => {
    expect(
      buildBookingLineItemsFromRow({
        id: "00000000-0000-4000-8000-000000000002",
        service: null,
        rooms: null,
        bathrooms: null,
        extras: [],
        total_paid_zar: null,
        amount_paid_cents: null,
        booking_snapshot: null,
      }),
    ).toEqual([]);
  });
});
