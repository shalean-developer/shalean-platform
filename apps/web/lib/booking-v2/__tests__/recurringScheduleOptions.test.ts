import { describe, expect, it } from "vitest";

import {
  RECURRING_FREQUENCY_OPTIONS,
  recurringFrequencyLabel,
} from "@/src/features/booking-v2/config/recurringScheduleOptions";

describe("recurring schedule options", () => {
  it("offers custom days and the three standard repeat cadences", () => {
    expect(RECURRING_FREQUENCY_OPTIONS).toEqual([
      { value: "custom", label: "Custom days" },
      { value: "weekly", label: "Weekly" },
      { value: "fortnightly", label: "Fortnightly" },
      { value: "monthly", label: "Monthly" },
    ]);
  });

  it("uses customer-facing labels for every cadence", () => {
    expect(recurringFrequencyLabel("custom")).toBe("Custom days");
    expect(recurringFrequencyLabel("weekly")).toBe("Weekly");
    expect(recurringFrequencyLabel("fortnightly")).toBe("Fortnightly");
    expect(recurringFrequencyLabel("monthly")).toBe("Monthly");
  });
});
