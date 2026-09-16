import { describe, expect, it } from "vitest";
import {
  adjacentRegularCleaningScheduleStage,
  isRegularCleaningScheduleStageComplete,
  regularCleaningScheduleStages,
} from "@/src/features/booking-v2/steps/regularCleaningScheduleProgressiveDisclosure";

describe("regular cleaning schedule progressive disclosure", () => {
  it("skips the recurring schedule for once-off bookings", () => {
    expect(regularCleaningScheduleStages("once_off")).toEqual([
      "booking_type",
      "date_time",
      "cleaner",
    ]);
    expect(adjacentRegularCleaningScheduleStage("date_time", "next", "once_off"))
      .toBe("cleaner");
  });

  it("keeps recurring frequency on booking type before date and time", () => {
    expect(regularCleaningScheduleStages("recurring")).toEqual([
      "booking_type",
      "date_time",
      "cleaner",
    ]);
    expect(adjacentRegularCleaningScheduleStage("cleaner", "back", "recurring"))
      .toBe("date_time");
  });

  it("only marks earlier stages as complete", () => {
    expect(isRegularCleaningScheduleStageComplete("booking_type", "cleaner", "once_off"))
      .toBe(true);
    expect(isRegularCleaningScheduleStageComplete("cleaner", "cleaner", "once_off"))
      .toBe(false);
  });
});
