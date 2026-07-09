import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  buildDailyCleanerWorkloadShadowReport,
  reportDailyCleanerWorkloadShadow,
  scanDailyCleanerWorkloadShadow,
} from "@/lib/booking/cleanerDailyWorkloadShadow";
import { metrics } from "@/lib/metrics/counters";

vi.mock("@/lib/metrics/counters", () => ({
  metrics: {
    increment: vi.fn(),
  },
}));

describe("Phase 2E-B daily cleaner workload shadow scanner", () => {
  it("calculates total scheduled minutes per cleaner per day from persisted duration_minutes", () => {
    const report = buildDailyCleanerWorkloadShadowReport([
      { id: "a", cleaner_id: "cleaner-1", date: "2026-06-01", duration_minutes: 180 },
      { id: "b", cleaner_id: "cleaner-1", date: "2026-06-01", duration_minutes: 120 },
      { id: "c", cleaner_id: "cleaner-2", date: "2026-06-01", duration_minutes: 90 },
    ]);

    expect(report.soloDays).toEqual([
      expect.objectContaining({
        cleanerId: "cleaner-1",
        dateYmd: "2026-06-01",
        jobKind: "solo",
        bookingIds: ["a", "b"],
        totalScheduledMinutes: 300,
        riskBand: "normal",
      }),
      expect.objectContaining({
        cleanerId: "cleaner-2",
        dateYmd: "2026-06-01",
        jobKind: "solo",
        bookingIds: ["c"],
        totalScheduledMinutes: 90,
        riskBand: "normal",
      }),
    ]);
  });

  it("uses estimated_duration_minutes when duration_minutes is missing", () => {
    const report = buildDailyCleanerWorkloadShadowReport([
      { id: "e1", cleaner_id: "cleaner-1", date: "2026-06-01", estimated_duration_minutes: 150 },
    ]);

    expect(report.soloDays[0]).toEqual(
      expect.objectContaining({
        bookingIds: ["e1"],
        fallbackBookingIds: [],
        fallbackCount: 0,
        totalScheduledMinutes: 150,
      }),
    );
  });

  it("reports fallback usage for missing or invalid duration_minutes without blocking", () => {
    const report = buildDailyCleanerWorkloadShadowReport([
      { id: "missing", cleaner_id: "cleaner-1", date: "2026-06-01", duration_minutes: null },
      { id: "too-small", cleaner_id: "cleaner-1", date: "2026-06-01", duration_minutes: 10 },
    ]);

    expect(report.soloDays[0]).toEqual(
      expect.objectContaining({
        bookingIds: ["missing", "too-small"],
        fallbackBookingIds: ["missing", "too-small"],
        fallbackCount: 2,
        totalScheduledMinutes: 240,
      }),
    );
    expect(report.fallbackUsage).toEqual([
      expect.objectContaining({ bookingId: "missing", fallbackMinutes: 120, rawDurationMinutes: null }),
      expect.objectContaining({ bookingId: "too-small", fallbackMinutes: 120, rawDurationMinutes: 10 }),
    ]);
  });

  it("flags risky days near 8 hours and over-limit days separately", () => {
    const report = buildDailyCleanerWorkloadShadowReport([
      { id: "r1", cleaner_id: "cleaner-risk", date: "2026-06-01", duration_minutes: 240 },
      { id: "r2", cleaner_id: "cleaner-risk", date: "2026-06-01", duration_minutes: 180 },
      { id: "o1", cleaner_id: "cleaner-over", date: "2026-06-01", duration_minutes: 300 },
      { id: "o2", cleaner_id: "cleaner-over", date: "2026-06-01", duration_minutes: 240 },
    ]);

    expect(report.riskyDays).toEqual([
      expect.objectContaining({
        cleanerId: "cleaner-risk",
        totalScheduledMinutes: 420,
        riskBand: "risky_near_8h",
      }),
    ]);
    expect(report.overLimitDays).toEqual([
      expect.objectContaining({
        cleanerId: "cleaner-over",
        totalScheduledMinutes: 540,
        riskBand: "over_8h",
      }),
    ]);
  });

  it("keeps team jobs in a separate shadow bucket keyed by payout owner or cleaner", () => {
    const report = buildDailyCleanerWorkloadShadowReport([
      { id: "solo", cleaner_id: "lead-1", date: "2026-06-01", duration_minutes: 180 },
      {
        id: "team",
        cleaner_id: "lead-1",
        payout_owner_cleaner_id: "lead-1",
        team_id: "team-1",
        is_team_job: true,
        date: "2026-06-01",
        duration_minutes: 240,
      },
    ]);

    expect(report.soloDays).toEqual([
      expect.objectContaining({
        cleanerId: "lead-1",
        jobKind: "solo",
        bookingIds: ["solo"],
        totalScheduledMinutes: 180,
        teamIds: [],
      }),
    ]);
    expect(report.teamDays).toEqual([
      expect.objectContaining({
        cleanerId: "lead-1",
        jobKind: "team",
        bookingIds: ["team"],
        totalScheduledMinutes: 240,
        teamIds: ["team-1"],
      }),
    ]);
  });

  it("emits shadow metrics only; it does not reject or mutate report data", () => {
    const report = buildDailyCleanerWorkloadShadowReport([
      { id: "fallback", cleaner_id: "cleaner-1", date: "2026-06-01", duration_minutes: null },
      { id: "over", cleaner_id: "cleaner-2", date: "2026-06-01", duration_minutes: 500 },
    ]);

    reportDailyCleanerWorkloadShadow(report, { source: "test" });

    expect(metrics.increment).toHaveBeenCalledWith(
      "booking.daily_workload_shadow.summary",
      expect.objectContaining({
        source: "test",
        overLimitDayCount: 1,
        fallbackCount: 1,
      }),
    );
    expect(metrics.increment).toHaveBeenCalledWith(
      "booking.daily_workload_shadow.flagged_day",
      expect.objectContaining({
        source: "test",
        cleanerId: "cleaner-2",
        riskBand: "over_8h",
      }),
    );
    expect(metrics.increment).toHaveBeenCalledWith(
      "booking.daily_workload_shadow.duration_fallback",
      expect.objectContaining({ source: "test", count: 1 }),
    );
  });

  it("provides a read-only DB scanner using bookings.duration_minutes and scheduling statuses", async () => {
    const calls: Record<string, unknown> = {};
    const admin = {
      from(table: string) {
        calls.table = table;
        return {
          select(columns: string) {
            calls.columns = columns;
            return {
              in(column: string, values: string[]) {
                calls.statusColumn = column;
                calls.statuses = values;
                return {
                  gte(columnGte: string, from: string) {
                    calls.gte = [columnGte, from];
                    return {
                      async lte(columnLte: string, to: string) {
                        calls.lte = [columnLte, to];
                        return {
                          data: [
                            { id: "a", cleaner_id: "cleaner-1", date: "2026-06-01", duration_minutes: 480 },
                          ],
                          error: null,
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    } as unknown as SupabaseClient;

    const res = await scanDailyCleanerWorkloadShadow(admin, {
      dateFromYmd: "2026-06-01",
      dateToYmd: "2026-06-02",
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.report.riskyDays).toEqual([
        expect.objectContaining({ cleanerId: "cleaner-1", totalScheduledMinutes: 480 }),
      ]);
    }
    expect(calls).toEqual(
      expect.objectContaining({
        table: "bookings",
        statusColumn: "status",
        gte: ["date", "2026-06-01"],
        lte: ["date", "2026-06-02"],
      }),
    );
    expect(String(calls.columns)).toContain("duration_minutes");
    expect(String(calls.columns)).toContain("is_team_job");
  });
});
