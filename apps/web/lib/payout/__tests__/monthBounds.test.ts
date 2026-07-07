import { describe, expect, it } from "vitest";
import {
  getJohannesburgMonthBoundsContainingYmd,
  getPreviousMonthDateBoundsJhb,
  isMonthlyPayoutPeriod,
} from "@/lib/payout/monthBounds";
import { MONTHLY_PAYOUT_START_YMD } from "@/lib/payout/payoutPeriodConfig";

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
    expect(isMonthlyPayoutPeriod("2026-07-01")).toBe(true);
    expect(isMonthlyPayoutPeriod("2026-06-30")).toBe(false);
  });
});
