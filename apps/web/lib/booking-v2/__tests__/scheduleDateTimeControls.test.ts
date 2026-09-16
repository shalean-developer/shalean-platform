import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/features/booking-v2/steps/Step2Schedule.tsx"),
  "utf8",
);

describe("booking schedule date and time controls", () => {
  it("uses a calendar-backed date field and an available-time dropdown", () => {
    expect(source).toContain('type="date"');
    expect(source).toContain('id="booking-time"');
    expect(source).toContain("availableTimeSlots.map((slot)");
    expect(source).toContain("formatCustomerBookingSlotLabel(slot)");
  });

  it("keeps time selection disabled until live availability is verified", () => {
    expect(source).toContain("!slotsVerified ||");
    expect(source).toContain("availableTimeSlots.length === 0");
    expect(source).toContain("isSelectedBookingSlotVerified(time, availability, slotsVerified)");
  });

  it("removes the large inline calendar and time-slot button grid", () => {
    expect(source).not.toContain("function CustomCalendar");
    expect(source).not.toContain("<TimeSlotPicker");
  });
});
