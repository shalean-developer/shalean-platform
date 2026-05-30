import { describe, expect, it } from "vitest";
import { checkoutScheduleSlotsAllUnavailable } from "@/lib/booking/useCheckoutScheduleAvailability";
import { generateBookingTimeSlots } from "@/lib/booking/bookingTimeSlots";

describe("checkoutScheduleSlotsAllUnavailable", () => {
  it("marks every static slot unavailable", () => {
    const map = checkoutScheduleSlotsAllUnavailable();
    for (const t of generateBookingTimeSlots()) {
      expect(map[t]).toBe(false);
    }
  });
});
