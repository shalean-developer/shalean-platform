import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  RECURRING_FREQUENCY_OPTIONS,
  recurringFrequencyLabel,
} from "@/src/features/booking-v2/config/recurringScheduleOptions";

const scheduleSource = readFileSync(
  join(process.cwd(), "src/features/booking-v2/steps/Step2Schedule.tsx"),
  "utf8",
);

describe("recurring schedule options", () => {
  it("offers custom days and the three standard repeat cadences", () => {
    expect(RECURRING_FREQUENCY_OPTIONS).toEqual([
      { value: "custom", label: "Custom" },
      { value: "weekly", label: "Weekly" },
      { value: "fortnightly", label: "Fortnightly" },
      { value: "monthly", label: "Monthly" },
    ]);
  });

  it("uses customer-facing labels for every cadence", () => {
    expect(recurringFrequencyLabel("custom")).toBe("Custom");
    expect(recurringFrequencyLabel("weekly")).toBe("Weekly");
    expect(recurringFrequencyLabel("fortnightly")).toBe("Fortnightly");
    expect(recurringFrequencyLabel("monthly")).toBe("Monthly");
  });

  it("keeps compact frequency cards tall enough to show their descriptions", () => {
    expect(scheduleSource).toContain(
      "sm:aspect-auto sm:h-[100px] sm:min-h-0 sm:px-3 sm:py-2",
    );
    expect(scheduleSource).not.toContain("sm:aspect-[2/1]");
  });
});
