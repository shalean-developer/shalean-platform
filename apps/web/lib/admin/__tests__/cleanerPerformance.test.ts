import { describe, expect, it } from "vitest";
import {
  aggregateCleanerPerformance,
  MAX_PUNCTUALITY_LATE_MINUTES,
  punctualitySampleForBooking,
} from "@/lib/admin/cleanerPerformance";

describe("punctualitySampleForBooking", () => {
  it("returns on-time when started_at is on booking day before slot", () => {
    const sample = punctualitySampleForBooking({
      cleaner_id: "c1",
      date: "2026-06-19",
      time: "10:00",
      started_at: "2026-06-19T07:55:00.000Z", // 09:55 SAST
      completed_at: null,
      status: "in_progress",
    });
    expect(sample).toEqual({ onTime: true, lateMinutes: 0 });
  });

  it("returns late minutes when started after slot on same day", () => {
    const sample = punctualitySampleForBooking({
      cleaner_id: "c1",
      date: "2026-06-19",
      time: "10:00",
      started_at: "2026-06-19T08:30:00.000Z", // 10:30 SAST
      completed_at: null,
      status: "in_progress",
    });
    expect(sample?.onTime).toBe(false);
    expect(sample?.lateMinutes).toBe(30);
  });

  it("excludes started_at on a different calendar day than booking date", () => {
    const sample = punctualitySampleForBooking({
      cleaner_id: "c1",
      date: "2026-05-01",
      time: "08:00",
      started_at: "2026-06-19T08:00:00.000Z",
      completed_at: "2026-06-19T12:00:00.000Z",
      status: "completed",
    });
    expect(sample).toBeNull();
  });

  it(`excludes lateness above ${MAX_PUNCTUALITY_LATE_MINUTES} minutes`, () => {
    const sample = punctualitySampleForBooking({
      cleaner_id: "c1",
      date: "2026-06-19",
      time: "08:00",
      started_at: "2026-06-19T14:00:00.000Z", // 16:00 SAST, 8h late
      completed_at: null,
      status: "completed",
    });
    expect(sample).toBeNull();
  });
});

describe("aggregateCleanerPerformance", () => {
  it("does not inflate avg lateness from cross-day timestamp mismatches", () => {
    const names = new Map([["c1", "Test Cleaner"]]);
    const { cleaners } = aggregateCleanerPerformance(
      [
        {
          cleaner_id: "c1",
          date: "2026-05-01",
          time: "08:00",
          started_at: "2026-06-19T10:00:00.000Z",
          completed_at: "2026-06-19T12:00:00.000Z",
          status: "completed",
        },
        {
          cleaner_id: "c1",
          date: "2026-06-19",
          time: "10:00",
          started_at: "2026-06-19T08:00:00.000Z",
          completed_at: "2026-06-19T10:00:00.000Z",
          status: "completed",
        },
      ],
      names,
      new Date("2026-06-19T18:00:00+02:00"),
    );
    expect(cleaners).toHaveLength(1);
    expect(cleaners[0]!.punctualityJobs).toBe(1);
    expect(cleaners[0]!.avgLateMinutes).toBe(0);
    expect(cleaners[0]!.onTimeRate).toBe(1);
  });

  it("returns null on-time pct for days without eligible punctuality samples", () => {
    const { fleetTrend7d } = aggregateCleanerPerformance(
      [
        {
          cleaner_id: "c1",
          date: "2026-06-19",
          time: "10:00",
          started_at: null,
          completed_at: "2026-06-19T12:00:00.000Z",
          status: "completed",
        },
      ],
      new Map([["c1", "A"]]),
      new Date("2026-06-19T18:00:00+02:00"),
    );
    const today = fleetTrend7d.find((d) => d.day === "2026-06-19");
    expect(today?.completedJobs).toBe(1);
    expect(today?.onTimePct).toBeNull();
  });

  it("uses persisted scheduled duration for avgJobDurationMinutes, not wall-clock", () => {
    const { cleaners } = aggregateCleanerPerformance(
      [
        {
          cleaner_id: "c1",
          date: "2026-06-19",
          time: "08:00",
          started_at: "2026-06-19T06:00:00.000Z",
          completed_at: "2026-06-19T07:00:00.000Z",
          status: "completed",
          duration_minutes: 180,
        },
        {
          cleaner_id: "c1",
          date: "2026-06-20",
          time: "08:00",
          started_at: "2026-06-20T06:00:00.000Z",
          completed_at: "2026-06-20T10:00:00.000Z",
          status: "completed",
          estimated_duration_minutes: 240,
        },
      ],
      new Map([["c1", "Cleaner One"]]),
    );
    expect(cleaners).toHaveLength(1);
    expect(cleaners[0]!.avgJobDurationMinutes).toBe(210);
    expect(cleaners[0]!.scheduledDurationSamples).toBe(2);
    expect(cleaners[0]!.avgActualDurationMinutes).toBeGreaterThan(0);
    expect(cleaners[0]!.avgActualDurationMinutes).not.toBe(cleaners[0]!.avgJobDurationMinutes);
  });
});
