import { describe, expect, it } from "vitest";
import {
  allocateRecurringPrepayment,
  buildRecurringPrepaymentQuote,
} from "@/lib/recurring/recurringPrepayment";

describe("first-30-day recurring prepayment", () => {
  it("uses exact weekly dates rather than an average month multiplier", () => {
    const quote = buildRecurringPrepaymentQuote({
      startDate: "2026-09-24",
      frequency: "weekly",
      recurringDays: ["Thursday"],
      perVisitZar: 500,
    });
    expect(quote?.occurrenceDates).toEqual([
      "2026-09-24",
      "2026-10-01",
      "2026-10-08",
      "2026-10-15",
      "2026-10-22",
    ]);
    expect(quote?.grossPackageZar).toBe(2_500);
  });

  it("prices exact fortnightly coverage", () => {
    const quote = buildRecurringPrepaymentQuote({
      startDate: "2026-09-24",
      frequency: "fortnightly",
      recurringDays: ["Thursday"],
      perVisitZar: 3_833,
    });
    expect(quote?.occurrenceDates).toEqual(["2026-09-24", "2026-10-08", "2026-10-22"]);
    expect(quote?.grossPackageZar).toBe(11_499);
  });

  it("charges one monthly deep-clean visit even when the 30-day window reaches the next calendar date", () => {
    const quote = buildRecurringPrepaymentQuote({
      startDate: "2026-09-24",
      frequency: "monthly",
      recurringDays: [],
      perVisitZar: 1_380,
      serviceSlug: "deep-cleaning",
    });

    expect(quote?.occurrenceDates).toEqual(["2026-09-24"]);
    expect(quote?.visitCount).toBe(1);
    expect(quote?.grossPackageZar).toBe(1_380);
  });

  it("allocates the aggregate payment once without changing the plan price", () => {
    expect(allocateRecurringPrepayment({
      occurrenceDates: ["2026-09-24", "2026-10-08"],
      perVisitZar: 3_833,
      packagePayableZar: 7_166,
    })).toEqual([
      { occurrenceDate: "2026-09-24", allocatedZar: 3_833 },
      { occurrenceDate: "2026-10-08", allocatedZar: 3_333 },
    ]);
  });

  it("prices the next 30-day cycle as another complete package", () => {
    const quote = buildRecurringPrepaymentQuote({
      startDate: "2026-10-24",
      frequency: "weekly",
      recurringDays: ["Saturday", "Tuesday"],
      perVisitZar: 3_641,
    });

    expect(quote?.occurrenceDates).toHaveLength(9);
    expect(quote?.grossPackageZar).toBe(32_769);
    expect(quote?.perVisitZar).toBe(3_641);
  });

  it("rejects custom schedules until they have explicit occurrence dates", () => {
    expect(buildRecurringPrepaymentQuote({
      startDate: "2026-09-24",
      frequency: "custom",
      recurringDays: ["Thursday"],
      perVisitZar: 500,
    })).toBeNull();
  });
});
