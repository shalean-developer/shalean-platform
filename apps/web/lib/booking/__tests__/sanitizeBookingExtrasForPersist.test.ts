import { describe, expect, it } from "vitest";
import { MAX_BOOKING_EXTRAS_ROWS } from "@/lib/booking/bookingExtrasLimits";
import { sanitizeBookingExtrasForPersist } from "@/lib/booking/sanitizeBookingExtrasForPersist";

describe("sanitizeBookingExtrasForPersist", () => {
  it("passes through valid rows in order", () => {
    const rows = [
      { slug: "inside-oven", name: "Oven", price: 50 },
      { slug: "inside-fridge", name: "Fridge", price: 40 },
    ];
    expect(sanitizeBookingExtrasForPersist(rows)).toEqual(rows);
  });

  it("dedupes by slug keeping first", () => {
    expect(
      sanitizeBookingExtrasForPersist([
        { slug: "a", name: "A", price: 1 },
        { slug: "a", name: "B", price: 2 },
      ]),
    ).toEqual([{ slug: "a", name: "A", price: 1 }]);
  });

  it("truncates to MAX_BOOKING_EXTRAS_ROWS", () => {
    const many = Array.from({ length: MAX_BOOKING_EXTRAS_ROWS + 8 }, (_, i) => ({
      slug: `x-${i}`,
      name: `X ${i}`,
      price: i,
    }));
    const out = sanitizeBookingExtrasForPersist(many);
    expect(out).toHaveLength(MAX_BOOKING_EXTRAS_ROWS);
    expect(out[0]?.slug).toBe("x-0");
    expect(out[MAX_BOOKING_EXTRAS_ROWS - 1]?.slug).toBe(`x-${MAX_BOOKING_EXTRAS_ROWS - 1}`);
  });

  it("accepts string slugs with price 0", () => {
    expect(sanitizeBookingExtrasForPersist(["inside-oven", "  "])).toEqual([
      { slug: "inside-oven", name: "inside-oven", price: 0 },
    ]);
  });

  it("drops invalid entries", () => {
    expect(
      sanitizeBookingExtrasForPersist([
        null,
        {},
        { slug: "", name: "x", price: 1 },
        { slug: "ok", name: "OK", price: 10 },
        { slug: "bad-price", name: "Bad", price: NaN },
      ]),
    ).toEqual([{ slug: "ok", name: "OK", price: 10 }]);
  });
});
