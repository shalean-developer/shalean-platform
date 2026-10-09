import { describe, expect, it } from "vitest";
import { closedCatchUpPayoutPeriods } from "@/lib/payout/generateWeeklyPayouts";

describe("MASTER-03A closed-month payout catch-up periods", () => {
  it("includes older closed months and excludes the current open month", () => {
    const now = new Date("2026-10-09T12:00:00+02:00");

    expect(
      closedCatchUpPayoutPeriods(
        ["2026-06-01", "2026-08-01", "2026-09-01", "2026-09-01", "2026-10-01"],
        now,
      ),
    ).toEqual([
      { periodStart: "2026-08-01", periodEnd: "2026-08-31" },
      { periodStart: "2026-09-01", periodEnd: "2026-09-30" },
    ]);
  });

  it("does not make the current month eligible at its beginning or middle", () => {
    expect(
      closedCatchUpPayoutPeriods(["2026-09-01"], new Date("2026-09-01T00:01:00+02:00")),
    ).toEqual([]);

    expect(
      closedCatchUpPayoutPeriods(["2026-09-01"], new Date("2026-09-30T23:59:00+02:00")),
    ).toEqual([]);
  });

  it("makes a month eligible immediately after the Johannesburg month closes", () => {
    expect(
      closedCatchUpPayoutPeriods(["2026-09-01"], new Date("2026-10-01T00:01:00+02:00")),
    ).toEqual([{ periodStart: "2026-09-01", periodEnd: "2026-09-30" }]);
  });
});
