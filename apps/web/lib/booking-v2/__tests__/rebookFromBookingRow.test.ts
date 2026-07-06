import { describe, expect, it } from "vitest";
import {
  bookingV2FormPatchFromBookingRow,
  rebookBookUrlFromBookingRow,
} from "@/lib/booking-v2/rebookFromBookingRow";
import type { BookingRow } from "@/lib/dashboard/types";

const baseRow = (): BookingRow =>
  ({
    id: "bk-123",
    service: "Standard Cleaning",
    service_slug: "standard",
    date: "2026-01-15",
    time: "09:00",
    location: "12 Main Rd",
    suburb: "Sea Point",
    service_details: { bedrooms: "3", bathrooms: "2", propertyType: "house" },
    selected_extras: ["inside_oven"],
    access_instructions: "Ring bell",
    parking_instructions: "Visitor bay",
    gate_code: "1234",
    total_paid_zar: 500,
    amount_paid_cents: 50000,
    currency: "ZAR",
    status: "completed",
    booking_snapshot: null,
    created_at: "2026-01-01T00:00:00Z",
    paystack_reference: "ref",
  }) as BookingRow;

describe("rebookFromBookingRow", () => {
  it("builds rebook URL with canonical slug mapping", () => {
    expect(rebookBookUrlFromBookingRow(baseRow())).toBe("/book/regular-cleaning?rebook=bk-123&step=2");
    expect(
      rebookBookUrlFromBookingRow({ id: "x", service: null, service_slug: "deep-cleaning" }),
    ).toBe("/book/deep-cleaning?rebook=x&step=2");
  });

  it("maps row fields and clears schedule/cleaners", () => {
    const patch = bookingV2FormPatchFromBookingRow(baseRow(), "regular-cleaning", "individual_cleaners");
    expect(patch.suburb).toBe("Sea Point");
    expect(patch.address).toBe("12 Main Rd");
    expect(patch.serviceDetails).toEqual({ bedrooms: "3", bathrooms: "2", propertyType: "house" });
    expect(patch.selectedExtras).toEqual(["inside_oven"]);
    expect(patch.accessInstructions).toBe("Ring bell");
    expect(patch.date).toBe("");
    expect(patch.time).toBe("");
    expect(patch.selectedCleanerIds).toEqual([]);
  });
});
