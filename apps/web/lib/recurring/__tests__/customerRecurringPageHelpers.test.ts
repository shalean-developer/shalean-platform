import { describe, expect, it } from "vitest";
import { buildCustomerRecurringPlanOptions } from "@/lib/recurring/customerRecurringPlanOptions";
import { formatRecurringScheduleLine } from "@/lib/recurring/formatRecurringSchedule";

describe("formatRecurringScheduleLine", () => {
  it("formats weekly schedule with time", () => {
    expect(
      formatRecurringScheduleLine({
        frequency: "weekly",
        days_of_week: [1, 3],
        template_visit_time: "09:30",
      }),
    ).toBe("Weekly · Mon, Wed · 09:30");
  });

  it("formats monthly nth weekday pattern", () => {
    expect(
      formatRecurringScheduleLine({
        frequency: "monthly",
        days_of_week: [5],
        monthly_pattern: "nth_weekday",
        monthly_nth: 2,
        start_date: "2026-01-10",
      }),
    ).toBe("Monthly · Second Fri each month");
  });
});

describe("buildCustomerRecurringPlanOptions", () => {
  it("reads recurring discounts from pricing config", () => {
    const options = buildCustomerRecurringPlanOptions({
      recurring_discounts: {
        weekly: { type: "percent", value: 12 },
        fortnightly: { type: "percent", value: 8 },
        monthly: { type: "percent", value: 3 },
      },
    });
    expect(options.find((o) => o.frequency === "weekly")?.savingLabel).toBe("Save 12%");
    expect(options.find((o) => o.frequency === "biweekly")?.savingLabel).toBe("Save 8%");
    expect(options.some((o) => o.popular)).toBe(true);
  });
});
