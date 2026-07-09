import { describe, expect, it } from "vitest";
import {
  avgScheduledMinutes,
  computeFleetHourUtilizationPct,
  resolveReportingDurationMinutes,
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
});
