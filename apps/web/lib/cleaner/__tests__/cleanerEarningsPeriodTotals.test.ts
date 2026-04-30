import { describe, expect, it } from "vitest";
import { earningsPeriodCentsFromRows } from "@/lib/cleaner/cleanerEarningsPeriodTotals";
import { johannesburgCalendarYmd } from "@/lib/dashboard/johannesburgMonth";

describe("earningsPeriodCentsFromRows", () => {
  it("puts cents in today only when bucket YMD matches Johannesburg today (midnight boundary)", () => {
    const todayY = "2026-06-10";
    const now = new Date(`${todayY}T14:00:00+02:00`);
    expect(johannesburgCalendarYmd(now)).toBe(todayY);

    const yesterday = "2026-06-09";
    const { today_cents, week_cents } = earningsPeriodCentsFromRows(
      [
        { completed_at: `${yesterday}T18:00:00.000Z`, amount_cents: 5_000 },
        { completed_at: `${todayY}T08:00:00.000Z`, amount_cents: 3_000 },
      ],
      now,
    );
    expect(today_cents).toBe(3_000);
    expect(week_cents).toBeGreaterThanOrEqual(8_000);
  });

  it("uses schedule_date when completed_at is null", () => {
    const now = new Date("2026-06-10T12:00:00+02:00");
    const y = johannesburgCalendarYmd(now);
    const { today_cents } = earningsPeriodCentsFromRows(
      [{ completed_at: null, schedule_date: y, amount_cents: 2_500 }],
      now,
    );
    expect(today_cents).toBe(2_500);
  });

  it("treats date-only completed_at as civil day without UTC shift", () => {
    const now = new Date("2026-06-10T12:00:00+02:00");
    const { today_cents } = earningsPeriodCentsFromRows([{ completed_at: "2026-06-10", amount_cents: 100 }], now);
    expect(today_cents).toBe(100);
  });
});
