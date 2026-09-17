import { describe, expect, it } from "vitest";
import {
  DEEP_CLEANING_RECURRING_FREQUENCY,
  recurringFrequenciesForService,
  recurringScheduleAllowedForService,
  serviceUsesRecurringDayPicker,
} from "@/lib/booking-v2/serviceRecurringPolicy";
import { buildRecurringPrepaymentQuote } from "@/lib/recurring/recurringPrepayment";

describe("deep cleaning recurring policy", () => {
  it("offers monthly as the only recurring frequency", () => {
    expect(recurringFrequenciesForService("deep-cleaning")).toEqual(["monthly"]);
    expect(DEEP_CLEANING_RECURRING_FREQUENCY).toBe("monthly");
    expect(serviceUsesRecurringDayPicker("deep-cleaning")).toBe(false);
  });

  it("allows a monthly plan with no preferred weekdays", () => {
    expect(
      recurringScheduleAllowedForService({
        serviceSlug: "deep-cleaning",
        bookingType: "recurring",
        recurringFrequency: "monthly",
        recurringDays: [],
      }),
    ).toBe(true);
  });

  it.each([
    ["weekly", []],
    ["fortnightly", []],
    ["custom", []],
    ["monthly", ["Tuesday"]],
  ] as const)("rejects unsupported deep schedule %s with days %j", (frequency, recurringDays) => {
    expect(
      recurringScheduleAllowedForService({
        serviceSlug: "deep-cleaning",
        bookingType: "recurring",
        recurringFrequency: frequency,
        recurringDays,
      }),
    ).toBe(false);
  });

  it("prices exactly one deep-clean visit in the first monthly cycle", () => {
    const quote = buildRecurringPrepaymentQuote({
      startDate: "2026-09-18",
      frequency: "monthly",
      recurringDays: [],
      perVisitZar: 1300,
    });

    expect(quote).toMatchObject({
      occurrenceDates: ["2026-09-18"],
      visitCount: 1,
      grossPackageZar: 1300,
    });
  });

  it("does not change Regular Cleaning frequency choices", () => {
    expect(recurringFrequenciesForService("regular-cleaning")).toEqual([
      "custom",
      "weekly",
      "fortnightly",
      "monthly",
    ]);
    expect(serviceUsesRecurringDayPicker("regular-cleaning")).toBe(true);
  });
});
