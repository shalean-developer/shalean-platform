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
