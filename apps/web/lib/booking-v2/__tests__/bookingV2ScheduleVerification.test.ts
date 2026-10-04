import { describe, expect, it } from "vitest";
import {
  bookingV2ScheduleAvailabilityCacheKey,
  isSelectedBookingSlotVerified,
} from "@/lib/booking-v2/bookingV2ScheduleVerification";

describe("booking v2 schedule verification", () => {
  const base = {
    dateYmd: "2026-09-19",
    locationId: "location-1",
    serviceSlug: "regular-cleaning",
    bedrooms: 2,
    bathrooms: 1,
    extraRooms: 0,
    extras: ["oven", "fridge"],
    durationMinutes: 180,
  };

  it("uses stable cache keys for equivalent durations and extra ordering", () => {
    expect(bookingV2ScheduleAvailabilityCacheKey(base)).toBe(
      bookingV2ScheduleAvailabilityCacheKey({
        ...base,
        extras: ["fridge", "oven", "fridge"],
        durationMinutes: 180.4,
      }),
    );
  });

  it("changes the cache key when an eligibility input changes", () => {
    expect(bookingV2ScheduleAvailabilityCacheKey(base)).not.toBe(
      bookingV2ScheduleAvailabilityCacheKey({ ...base, bathrooms: 2 }),
    );
  });

  it("requires the selected slot to be verified and available", () => {
    const availability = { "08:00": true, "08:30": false };
    expect(isSelectedBookingSlotVerified("08:00", availability, false)).toBe(false);
    expect(isSelectedBookingSlotVerified("08:30", availability, true)).toBe(false);
    expect(isSelectedBookingSlotVerified("08:00", availability, true)).toBe(true);
  });
});
