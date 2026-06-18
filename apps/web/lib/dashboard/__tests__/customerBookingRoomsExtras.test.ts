import { describe, expect, it } from "vitest";
import { mapBookingRow } from "@/lib/dashboard/bookingUtils";
import type { BookingRow } from "@/lib/dashboard/types";

function baseRow(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    service: "Standard cleaning",
    date: "2026-06-20",
    time: "09:00",
    location: "12 Main Rd, Claremont",
    suburb: "Claremont",
    status: "assigned",
    created_at: "2026-06-17T10:00:00.000Z",
    paystack_reference: "SHL-TEST",
    ...overrides,
  } as BookingRow;
}

describe("mapBookingRow rooms & extras", () => {
  it("reads bedrooms from booking_snapshot.locked when DB columns are empty", () => {
    const mapped = mapBookingRow(
      baseRow({
        rooms: null,
        bathrooms: null,
        booking_snapshot: {
          v: 1,
          locked: { rooms: 3, bathrooms: 2, extras: [], locked: true, lockedAt: "2026-06-17T10:00:00.000Z" },
        },
      }),
    );
    expect(mapped.rooms).toEqual(["3 bedrooms", "2 bathrooms"]);
  });

  it("reads extras from locked.extras_line_items when bookings.extras is empty", () => {
    const mapped = mapBookingRow(
      baseRow({
        extras: [],
        booking_snapshot: {
          v: 1,
          locked: {
            rooms: 2,
            bathrooms: 1,
            extras: [],
            extras_line_items: [{ slug: "inside-oven", name: "Inside oven", price: 150 }],
            locked: true,
            lockedAt: "2026-06-17T10:00:00.000Z",
          },
        },
      }),
    );
    expect(mapped.extras).toEqual(["Inside oven · R 150"]);
  });

  it("humanizes locked.extras slugs when no line items exist", () => {
    const mapped = mapBookingRow(
      baseRow({
        extras: null,
        booking_snapshot: {
          v: 1,
          locked: {
            rooms: 2,
            bathrooms: 1,
            extras: ["inside-fridge"],
            locked: true,
            lockedAt: "2026-06-17T10:00:00.000Z",
          },
        },
      }),
    );
    expect(mapped.extras).toEqual(["Inside Fridge"]);
  });

  it("reads booking-v2 service_details, selected_extras, and pricing_summary", () => {
    const mapped = mapBookingRow(
      baseRow({
        service: null,
        service_slug: "regular-cleaning",
        rooms: null,
        bathrooms: null,
        extras: [],
        service_details: {
          bedrooms: "3",
          bathrooms: "2",
          propertyType: "house",
          hasPets: "yes",
          specialInstructions: "Rooms & extras are dirty",
        },
        selected_extras: ["inside_oven", "inside_fridge"],
        pricing_summary: {
          total: 1520,
          lineItems: [
            { label: "Regular Cleaning (base)", amountZar: 250 },
            { label: "3 bedrooms", amountZar: 90 },
            { label: "2 bathrooms", amountZar: 70 },
            { label: "Inside Oven", amountZar: 200 },
            { label: "Inside Fridge", amountZar: 150 },
          ],
        },
        access_instructions: "Use side gate",
        gate_code: "1234",
      }),
    );

    expect(mapped.serviceName).toBe("Regular Cleaning");
    expect(mapped.rooms).toEqual(["3 bedrooms", "2 bathrooms"]);
    expect(mapped.extras).toEqual(["Inside Oven · R 200", "Inside Fridge · R 150"]);
    expect(mapped.cleanDetails.some((line) => line.label === "Pets on site" && line.value === "Yes")).toBe(true);
    expect(mapped.accessNotes).toEqual([
      { label: "Access instructions", value: "Use side gate" },
      { label: "Gate code", value: "1234" },
    ]);
    expect(mapped.priceLines.length).toBeGreaterThan(1);
  });
});
