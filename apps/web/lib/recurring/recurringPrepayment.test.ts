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

  it("rejects custom schedules until they have explicit occurrence dates", () => {
    expect(buildRecurringPrepaymentQuote({
      startDate: "2026-09-24",
      frequency: "custom",
      recurringDays: ["Thursday"],
      perVisitZar: 500,
    })).toBeNull();
  });
});
