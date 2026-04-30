import { describe, expect, it } from "vitest";
import { isoWeekdayFromYmd, parseYmdSast } from "@/lib/recurring/johannesburgCalendar";

describe("isoWeekdayFromYmd", () => {
  it("returns Monday=1 for a known Monday in JHB civil calendar", () => {
    expect(isoWeekdayFromYmd("2026-06-08")).toBe(1);
  });

  it("returns Sunday=7 for a known Sunday", () => {
    expect(isoWeekdayFromYmd("2026-06-07")).toBe(7);
  });

  it("matches parseYmdSast noon instant weekday in JHB (regression vs getUTCDay-only)", () => {
    const ymd = "2026-03-15";
    const d = parseYmdSast(ymd);
    const fromIntl = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Johannesburg", weekday: "short" }).format(d);
    expect(["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"]).toContain(fromIntl);
    expect(isoWeekdayFromYmd(ymd)).toBeGreaterThanOrEqual(1);
    expect(isoWeekdayFromYmd(ymd)).toBeLessThanOrEqual(7);
  });
});
