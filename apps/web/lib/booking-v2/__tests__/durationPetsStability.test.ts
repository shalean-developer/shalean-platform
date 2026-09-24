import { describe, expect, it } from "vitest";
import { stableEstimatedCleaningHours } from "@/lib/booking-v2/formatEstimatedCleaningTime";
import { bookingDetailsStageReady } from "@/src/features/booking-v2/steps/serviceProgressiveDisclosure";

describe("Booking V2 duration and pets stability", () => {
  it("shows a numeric duration only for a current locked quote after details are complete", () => {
    expect(
      stableEstimatedCleaningHours({
        durationMinutes: 288,
        quoteReady: false,
        detailsReady: true,
      }),
    ).toBe("—");
    expect(
      stableEstimatedCleaningHours({
        durationMinutes: 288,
        quoteReady: true,
        detailsReady: false,
      }),
    ).toBe("—");
    expect(
      stableEstimatedCleaningHours({
        durationMinutes: 288,
        quoteReady: true,
        detailsReady: true,
      }),
    ).toBe("4.8");
  });

  it("treats explicit No pets as complete for Moving Cleaning", () => {
    expect(
      bookingDetailsStageReady(
        "moving-cleaning",
        "condition",
        { furnished: "no", hasPets: "no" },
        {},
      ),
    ).toBe(true);
    expect(
      bookingDetailsStageReady(
        "moving-cleaning",
        "condition",
        { furnished: "no" },
        {},
      ),
    ).toBe(false);
  });
});
