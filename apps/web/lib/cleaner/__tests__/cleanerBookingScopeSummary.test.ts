import { describe, expect, it } from "vitest";
import {
  cleanerBookingCardDetailsFromRow,
  cleanerBookingScopeLines,
} from "@/lib/cleaner/cleanerBookingScopeSummary";

describe("cleanerBookingScopeLines", () => {
  it("prefers top-level rooms/bathrooms and extras JSON from the row", () => {
    const lines = cleanerBookingScopeLines({
      rooms: 2,
      bathrooms: 1,
      extras: [{ slug: "inside-oven", name: "Inside Oven", price: 59 }],
      booking_snapshot: null,
    });
    expect(lines).toEqual(["Rooms: 2 bedrooms, 1 bathroom", "Extras: Inside Oven"]);
  });

  it("falls back to snapshot flat then locked", () => {
    const lines = cleanerBookingScopeLines({
      rooms: null,
      bathrooms: null,
      extras: [],
      booking_snapshot: {
        v: 1,
        flat: { rooms: 3, bathrooms: 2, extras: [], service: "standard", location: null, date: null, time: null },
      },
    });
    expect(lines).toEqual(["Rooms: 3 bedrooms, 2 bathrooms"]);
  });

  it("uses locked extras_line_items when extras json is empty", () => {
    const lines = cleanerBookingScopeLines({
      extras: [],
      booking_snapshot: {
        v: 1,
        locked: {
          locked: true,
          lockedAt: "2026-01-01T00:00:00.000Z",
          date: "2026-01-02",
          time: "10:00",
          finalPrice: 100,
          finalHours: 2,
          surge: 1,
          service: "standard",
          extras: ["inside-oven"],
          extras_line_items: [{ slug: "inside-oven", name: "Inside Oven", price: 59 }],
        },
      },
    });
    expect(lines).toContain("Extras: Inside Oven");
  });

  it("prefers booking_line_items wire when lineItems is set", () => {
    const lines = cleanerBookingScopeLines({
      rooms: 9,
      bathrooms: 9,
      extras: [{ slug: "ignored", name: "Ignored", price: 1 }],
      lineItems: [
        { item_type: "room", slug: null, name: "Bedrooms", quantity: 2 },
        { item_type: "bathroom", slug: null, name: "Bathrooms", quantity: 1 },
        { item_type: "extra", slug: "inside-oven", name: "Inside Oven", quantity: 1 },
      ],
      booking_snapshot: null,
    });
    expect(lines).toEqual(["Rooms: 2 bedrooms, 1 bathroom", "Extras: Inside Oven"]);
  });

  it("merges row/snapshot rooms with bundled line items that omit room rows", () => {
    const row = {
      rooms: 3,
      bathrooms: 2,
      extras: [{ slug: "inside-oven", name: "Inside Oven", price: 59 }],
      lineItems: [
        { item_type: "base", slug: "monthly-bundle", name: "Monthly clean", quantity: 1 },
        { item_type: "extra", slug: "inside-oven", name: "Inside Oven", quantity: 1 },
      ],
      booking_snapshot: null,
    };
    expect(cleanerBookingScopeLines(row)).toEqual([
      "Rooms: 3 bedrooms, 2 bathrooms",
      "Extras: Inside Oven",
    ]);
    expect(cleanerBookingCardDetailsFromRow(row)).toEqual({
      bedrooms: 3,
      bathrooms: 2,
      extraNames: ["Inside Oven"],
    });
  });

  it("title-cases locked extra slugs when line items are missing", () => {
    const lines = cleanerBookingScopeLines({
      extras: [],
      booking_snapshot: {
        v: 1,
        locked: {
          locked: true,
          lockedAt: "2026-01-01T00:00:00.000Z",
          date: "2026-01-02",
          time: "10:00",
          finalPrice: 100,
          finalHours: 2,
          surge: 1,
          service: "standard",
          extras: ["water-plants"],
        },
      },
    });
    expect(lines).toEqual(["Extras: Water Plants"]);
  });
});
