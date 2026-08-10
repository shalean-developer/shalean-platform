import { describe, expect, it } from "vitest";
import {
  avgScheduledMinutes,
  computeFleetHourUtilizationPct,
  resolveReportingDurationMinutes,
  summarizeDurationCoverage,
  sumScheduledMinutes,
} from "@/lib/admin/reporting/bookingDurationReporting";

describe("bookingDurationReporting", () => {
  it("resolveReportingDurationMinutes follows persisted column order", () => {
    expect(
      resolveReportingDurationMinutes({
        duration_minutes: 180,
        estimated_duration_minutes: 120,
        pricing_summary: { estimated_duration_minutes: 90 },
      }),
    ).toBe(180);

    expect(
      resolveReportingDurationMinutes({
        estimated_duration_minutes: 150,
      }),
    ).toBe(150);
  });

  it("sumScheduledMinutes and avgScheduledMinutes skip rows without persisted duration", () => {
    const rows = [
      { duration_minutes: 120 },
      { duration_minutes: 120 },
      { duration_minutes: null },
    ];
    expect(sumScheduledMinutes(rows)).toBe(240);
    expect(avgScheduledMinutes(rows)).toBe(120);
    expect(avgScheduledMinutes([{ duration_minutes: null }])).toBeNull();
  });

  it("computeFleetHourUtilizationPct uses scheduled hours over fleet capacity", () => {
    const utilization = computeFleetHourUtilizationPct({
      bookings: [{ duration_minutes: 240 }, { duration_minutes: 120 }],
      activeCleanerCount: 2,
      windowDays: 1,
      policyMinutesPerCleanerDay: 480,
    });
    expect(utilization).toBe(37.5);
  });

  it("reports canonical-duration coverage and neutralizes utilization when coverage is incomplete", () => {
    expect(summarizeDurationCoverage([
      { duration_minutes: 120 },
      { duration_minutes: null },
    ])).toEqual({
      totalBookings: 2,
      coveredBookings: 1,
      missingBookings: 1,
      coveragePct: 50,
    });

    expect(computeFleetHourUtilizationPct({
      bookings: [{ duration_minutes: 480 }, { duration_minutes: null }],
      activeCleanerCount: 1,
      windowDays: 1,
      policyMinutesPerCleanerDay: 480,
    })).toBe(50);
  });
});
