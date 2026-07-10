import { describe, expect, it } from "vitest";
import {
  resolveHealedBookingDurationMinutes,
} from "@/lib/booking/quote/healBookingDurationForScheduling";
import { resolvePersistedBookingDurationMinutes } from "@/lib/booking/quote/bookingQuotePersistence";

describe("healBookingDurationForScheduling", () => {
  it("uses persisted duration when present", () => {
    expect(
      resolveHealedBookingDurationMinutes({
        id: "b1",
        duration_minutes: 180,
        rooms: 2,
        bathrooms: 1,
        service: "standard",
      }),
    ).toBe(180);
  });

  it("falls back to duration_hours before recomputing", () => {
    expect(
      resolveHealedBookingDurationMinutes({
        id: "b2",
        duration_minutes: null,
        duration_hours: 3,
        rooms: 2,
        bathrooms: 1,
        service: "standard",
      }),
    ).toBe(180);
  });

  it("recomputes from rooms and service when all duration fields are empty", () => {
    const minutes = resolveHealedBookingDurationMinutes({
      id: "b3",
      duration_minutes: null,
      estimated_duration_minutes: null,
      duration_hours: null,
      pricing_summary: null,
      booking_snapshot: null,
      rooms: 2,
      bathrooms: 1,
      service: "standard",
    });
    expect(minutes).toBeGreaterThanOrEqual(120);
    expect(resolvePersistedBookingDurationMinutes({ duration_minutes: null, rooms: 2 } as never)).toBeNull();
  });

  it("uses admin room defaults when rooms are missing", () => {
    const minutes = resolveHealedBookingDurationMinutes({
      id: "b4",
      duration_minutes: null,
      service_slug: "standard",
      service: "standard",
    });
    expect(minutes).toBeGreaterThanOrEqual(120);
  });

  it("reads duration from price_snapshot.duration_hours", () => {
    expect(
      resolveHealedBookingDurationMinutes({
        id: "b5",
        duration_minutes: null,
        price_snapshot: { duration_hours: 2.5 },
      }),
    ).toBe(150);
  });
});
