import { describe, expect, it } from "vitest";
import {
  CUSTOMER_ONLINE_BOOKING_TIME_SLOTS,
  filterCustomerOnlineBookingTimeSlots,
  formatCustomerBookingSlotLabel,
  isCustomerOnlineBookingTimeSlot,
} from "@/lib/booking-v2/customerBookingTimeSlots";

describe("customerBookingTimeSlots", () => {
  it("lists morning half-hour slots through 12:30", () => {
    expect(CUSTOMER_ONLINE_BOOKING_TIME_SLOTS).toEqual([
      "08:00",
      "08:30",
      "09:00",
      "09:30",
      "10:00",
      "10:30",
      "11:00",
      "11:30",
      "12:00",
      "12:30",
    ]);
  });

  it("formats slot labels for cards", () => {
    expect(formatCustomerBookingSlotLabel("08:00")).toBe("8:00 AM");
    expect(formatCustomerBookingSlotLabel("12:30")).toBe("12:30 PM");
  });

  it("rejects afternoon self-serve times", () => {
    expect(isCustomerOnlineBookingTimeSlot("13:00")).toBe(false);
    expect(isCustomerOnlineBookingTimeSlot("12:30")).toBe(true);
  });

  it("returns all slots for a future date", () => {
    expect(filterCustomerOnlineBookingTimeSlots("2099-01-15")).toEqual([
      ...CUSTOMER_ONLINE_BOOKING_TIME_SLOTS,
    ]);
  });
});
