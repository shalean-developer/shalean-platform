import { describe, expect, it } from "vitest";
import {
  getJohannesburgMonthBoundsContainingYmd,
  getPreviousMonthDateBoundsJhb,
  isCanonicalJohannesburgMonthPeriod,
  isClosedMonthlyPayoutBatchPeriod,
  isMonthlyPayoutBatchPeriod,
  isMonthlyPayoutPeriod,
} from "@/lib/payout/monthBounds";
import { MONTHLY_PAYOUT_FIRST_MONTH_END_YMD, MONTHLY_PAYOUT_START_YMD } from "@/lib/payout/payoutPeriodConfig";

describe("monthBounds", () => {
  it("returns full Johannesburg calendar month for a mid-month date", () => {
    expect(getJohannesburgMonthBoundsContainingYmd("2026-07-15")).toEqual({
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
    });
  });

  it("returns previous month bounds in Johannesburg", () => {
    expect(getPreviousMonthDateBoundsJhb(new Date("2026-08-15T10:00:00+02:00"))).toEqual({
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
    });
  });

  it("enforces monthly payout epoch from July 2026", () => {
    expect(MONTHLY_PAYOUT_START_YMD).toBe("2026-07-01");
    expect(MONTHLY_PAYOUT_FIRST_MONTH_END_YMD).toBe("2026-07-31");
    expect(isMonthlyPayoutPeriod("2026-07-01")).toBe(true);
    expect(isMonthlyPayoutPeriod("2026-06-30")).toBe(false);
  });

  it("accepts only full calendar months for monthly payout batches", () => {
    expect(isCanonicalJohannesburgMonthPeriod("2026-07-01", "2026-07-31")).toBe(true);
    expect(isCanonicalJohannesburgMonthPeriod("2026-07-01", "2026-07-07")).toBe(false);
    expect(isCanonicalJohannesburgMonthPeriod("2026-06-23", "2026-06-29")).toBe(false);
    expect(isMonthlyPayoutBatchPeriod("2026-07-01", "2026-07-31")).toBe(true);
    expect(isMonthlyPayoutBatchPeriod("2026-06-01", "2026-06-30")).toBe(false);
  });

  it("treats only fully closed Johannesburg months as payable", () => {
    const duringAugust = new Date("2026-08-11T22:00:00+02:00");
    expect(isClosedMonthlyPayoutBatchPeriod("2026-07-01", "2026-07-31", duringAugust)).toBe(true);
    expect(isClosedMonthlyPayoutBatchPeriod("2026-08-01", "2026-08-31", duringAugust)).toBe(false);
    expect(isClosedMonthlyPayoutBatchPeriod("2026-08-01", "2026-08-31", new Date("2026-09-01T00:01:00+02:00"))).toBe(true);
  });

  it("rejects malformed and partial periods from the closed-month guard", () => {
    const now = new Date("2026-09-15T12:00:00+02:00");
    expect(isClosedMonthlyPayoutBatchPeriod("2026-08-01", "2026-08-30", now)).toBe(false);
    expect(isClosedMonthlyPayoutBatchPeriod("2026-06-01", "2026-06-30", now)).toBe(false);
  });
});
