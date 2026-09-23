import { describe, expect, it } from "vitest";
import {
  bookingStepFromQuery,
  bookingStepQueryValue,
} from "@/src/features/booking-v2/types";

describe("booking step query values", () => {
  it("writes readable stepper labels", () => {
    expect(bookingStepQueryValue(1)).toBe("details");
    expect(bookingStepQueryValue(2)).toBe("schedule");
    expect(bookingStepQueryValue(3)).toBe("review");
    expect(bookingStepQueryValue(4)).toBe("payment");
  });

  it("reads labels and retains numeric URL compatibility", () => {
    expect(bookingStepFromQuery("details")).toBe(1);
    expect(bookingStepFromQuery("schedule")).toBe(2);
    expect(bookingStepFromQuery("review")).toBe(3);
    expect(bookingStepFromQuery("payment")).toBe(4);
    expect(bookingStepFromQuery("3")).toBe(3);
    expect(bookingStepFromQuery("unknown")).toBe(1);
  });
});
