import { describe, expect, it } from "vitest";
import {
  calendarDateYmdInTimeZone,
  johannesburgDayUtcBounds,
  percentileLinear,
} from "@/lib/admin/metrics";

describe("percentileLinear", () => {
  it("returns null for empty", () => {
    expect(percentileLinear([], 0.5)).toBeNull();
  });

  it("interpolates p50 on even-length sample", () => {
    const s = [10, 20, 30, 40];
    expect(percentileLinear(s, 0.5)).toBe(25);
  });

  it("handles p95 without NaN when values missing from context path", () => {
    const s = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    const p95 = percentileLinear(s, 0.95);
    expect(p95).not.toBeNaN();
    expect(p95).toBeGreaterThanOrEqual(900);
  });
});

describe("Johannesburg day bounds", () => {
  it("covers 24h window length", () => {
    const { startIso, endExclusiveIso } = johannesburgDayUtcBounds("2026-06-15");
    const ms = new Date(endExclusiveIso).getTime() - new Date(startIso).getTime();
    expect(ms).toBe(86400000);
  });
});

describe("calendarDateYmdInTimeZone", () => {
  it("formats YYYY-MM-DD", () => {
    const d = new Date("2026-01-15T22:00:00.000Z");
    const ymd = calendarDateYmdInTimeZone(d, "Africa/Johannesburg");
    expect(ymd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
