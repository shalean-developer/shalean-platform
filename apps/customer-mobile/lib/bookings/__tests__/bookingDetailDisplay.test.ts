import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extrasLabelFromBooking,
  notesLabelFromBooking,
  roomsLabelFromBooking,
  serviceTitleFromBooking,
} from "../bookingDetailDisplay";
import type { CustomerBookingRow } from "@/services/types/customerBookings";

function row(overrides: Partial<CustomerBookingRow> = {}): CustomerBookingRow {
  return {
    id: "b1",
    status: "confirming",
    date: "2026-07-12",
    time: "08:30",
    service: "regular-cleaning",
    service_slug: "regular-cleaning",
    location: "10 Sloop Street",
    ...overrides,
  };
}

describe("bookingDetailDisplay", () => {
  it("formats rooms from service_details", () => {
    assert.equal(
      roomsLabelFromBooking(
        row({
          service_details: { bedrooms: "3", bathrooms: "2", extraRooms: "1" },
        }),
      ),
      "3 bedrooms · 2 bathrooms · 1 extra room",
    );
  });

  it("formats extras from pricing_summary, else humanizes selected ids", () => {
    assert.equal(
      extrasLabelFromBooking(
        row({
          selected_extras: ["inside_oven"],
          pricing_summary: {
            lineItems: [
              { label: "Regular Cleaning (base)", amountZar: 250 },
              { label: "Inside Oven", amountZar: 200 },
            ],
          },
        }),
      ),
      "Inside Oven",
    );
    assert.equal(
      extrasLabelFromBooking(row({ selected_extras: ["inside_fridge"] })),
      "Inside Fridge",
    );
  });

  it("reads notes from specialInstructions", () => {
    assert.equal(
      notesLabelFromBooking(
        row({ service_details: { specialInstructions: "Please lock the gate" } }),
      ),
      "Please lock the gate",
    );
  });

  it("humanizes service slug titles", () => {
    assert.equal(serviceTitleFromBooking(row()), "Regular Cleaning");
  });
});
