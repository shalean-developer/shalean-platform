import { describe, expect, it } from "vitest";
import {
  bookingMaxSameDayJobMinutesFromFirstSlot,
  bookingSlotEligibilityDurationMinutes,
  bookingSlotStartToMinutes,
} from "@/lib/booking/bookingTimeSlots";

describe("booking slot service day bounds", () => {
  it("7:00 uses capped duration within remaining day", () => {
    const start = bookingSlotStartToMinutes("07:00")!;
    const longJob = 14.5 * 60;
    expect(bookingSlotEligibilityDurationMinutes(start, longJob)).toBe(bookingMaxSameDayJobMinutesFromFirstSlot());
  });

  it("slot with under 30 minutes left in service day returns null", () => {
    const start = bookingSlotStartToMinutes("18:10")!;
    expect(bookingSlotEligibilityDurationMinutes(start, 120)).toBeNull();
  });

  it("normal 3h job at midday uses 3h for eligibility", () => {
    const start = bookingSlotStartToMinutes("10:00")!;
    expect(bookingSlotEligibilityDurationMinutes(start, 180)).toBe(180);
  });
});
