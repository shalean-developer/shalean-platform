import { describe, expect, it } from "vitest";
import { parseLockedBookingFromUnknown, resolveLockedBookingForAdminReprice } from "@/lib/booking/lockedBooking";

describe("resolveLockedBookingForAdminReprice", () => {
  it("returns parsed checkout lock when present", () => {
    const locked = {
      locked: true,
      lockedAt: "2026-06-01T10:00:00.000Z",
      date: "2026-06-10",
      time: "09:00",
      finalPrice: 650,
      finalHours: 3,
      surge: 1,
      rooms: 2,
      bathrooms: 1,
      extras: [],
      service: "standard",
    };
    const snap = { v: 1, locked };
    const resolved = resolveLockedBookingForAdminReprice(snap, {});
    expect(resolved).not.toBeNull();
    expect(resolved?.rooms).toBe(2);
  });

  it("synthesizes a lock from booking_snapshot.flat for sales-document bookings", () => {
    const snap = {
      v: 1,
      flat: {
        date: "2026-07-09",
        time: "10:00",
        rooms: 1,
        bathrooms: 1,
        extras: ["inside-fridge"],
        service: "standard",
        location: "Parklands, Cape Town",
      },
      sales_document_id: "abc",
    };
    const resolved = resolveLockedBookingForAdminReprice(snap, {
      total_paid_zar: 850,
      created_at: "2026-07-03T10:00:00.000Z",
    });
    expect(resolved).not.toBeNull();
    expect(resolved?.rooms).toBe(1);
    expect(resolved?.extras).toEqual(["inside-fridge"]);
    expect(resolved?.service).toBe("standard");
  });

  it("accepts bedrooms alias when parsing a raw lock payload", () => {
    const parsed = parseLockedBookingFromUnknown({
      locked: true,
      lockedAt: "2026-06-01T10:00:00.000Z",
      date: "2026-06-10",
      time: "09:00",
      finalPrice: 650,
      finalHours: 3,
      surge: 1,
      bedrooms: 3,
      bathrooms: 2,
      extras: [],
      service: "standard",
    });
    expect(parsed?.rooms).toBe(3);
  });
});
