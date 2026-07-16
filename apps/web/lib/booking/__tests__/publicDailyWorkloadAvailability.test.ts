import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { maxCleanerDailyWorkloadEnforcePublic } from "@/lib/booking/availabilityFlags";
import { getEligibleCleaners, type CleanerBase } from "@/lib/booking/getEligibleCleaners";
import { metrics } from "@/lib/metrics/counters";

vi.mock("@/lib/metrics/counters", () => ({
  metrics: {
    increment: vi.fn(),
  },
}));

const DATE = "2026-06-15";
const LOC = "11111111-1111-4111-8111-aaaaaaaaaaaa";
const CLEANER_ID = "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function cleaner(id = CLEANER_ID): CleanerBase {
  return {
    id,
    full_name: "Cleaner",
    phone: null,
    email: null,
    rating: 5,
    is_active: true,
    is_available: true,
    jobs_completed: 10,
    review_count: 0,
    location_id: LOC,
    status: "available",
    availability_weekdays: ["monday"],
    can_do_deep_cleaning: true,
    can_do_move_cleaning: true,
  };
}

function adminWithBookings(rows: Array<Record<string, unknown>>): SupabaseClient {
  return {
    from(table: string) {
      if (table !== "bookings") throw new Error(`unexpected table ${table}`);
      return {
        select(columns: string) {
          expect(columns).toContain("duration_minutes");
          expect(columns).toContain("is_team_job");
          return {
            in() {
              return {
                eq() {
                  return Promise.resolve({ data: rows, error: null });
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

async function runPublicEligibility(
  rows: Array<Record<string, unknown>>,
  opts: { requestedDurationMinutes?: number; cleanerId?: string } = {},
) {
  const cleanerId = opts.cleanerId ?? CLEANER_ID;
  return getEligibleCleaners(adminWithBookings(rows), {
    date: DATE,
    startTime: "10:00",
    durationMinutes: opts.requestedDurationMinutes ?? 240,
    locationId: LOC,
    locationExpandedIds: [LOC],
    preloadedCleaners: [cleaner(cleanerId)],
    preloadedAvailability: [
      {
        cleaner_id: cleanerId,
        date: DATE,
        start_time: "00:00",
        end_time: "23:59",
        is_available: true,
      },
    ],
    preloadedCleanerLocations: [{ cleaner_id: cleanerId, location_id: LOC }],
    enforcePublicDailyWorkloadLimit: maxCleanerDailyWorkloadEnforcePublic(),
  });
}

describe("Phase 2E-D public daily workload availability flag", () => {
  const originalFlag = process.env.MAX_CLEANER_DAILY_WORKLOAD_ENFORCE_PUBLIC;

  beforeEach(() => {
    vi.mocked(metrics.increment).mockClear();
  });

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.MAX_CLEANER_DAILY_WORKLOAD_ENFORCE_PUBLIC;
    else process.env.MAX_CLEANER_DAILY_WORKLOAD_ENFORCE_PUBLIC = originalFlag;
  });

  it("defaults OFF and preserves current public availability behavior", async () => {
    delete process.env.MAX_CLEANER_DAILY_WORKLOAD_ENFORCE_PUBLIC;
    expect(maxCleanerDailyWorkloadEnforcePublic()).toBe(false);

    const rows = await runPublicEligibility([
      {
        id: "long-existing",
        cleaner_id: CLEANER_ID,
        date: DATE,
        time: "00:00",
        status: "assigned",
        duration_minutes: 300,
      },
    ]);

    expect(rows.map((r) => r.id)).toEqual([CLEANER_ID]);
  });

  it("filters a solo cleaner when the requested booking would push the public workload over 8h", async () => {
    process.env.MAX_CLEANER_DAILY_WORKLOAD_ENFORCE_PUBLIC = "true";

    const rows = await runPublicEligibility([
      {
        id: "long-existing",
        cleaner_id: CLEANER_ID,
        date: DATE,
        time: "00:00",
        status: "assigned",
        duration_minutes: 300,
      },
    ]);

    expect(rows).toEqual([]);
  });

  it("keeps a near-limit cleaner available when requested booking stays at or below 8h", async () => {
    process.env.MAX_CLEANER_DAILY_WORKLOAD_ENFORCE_PUBLIC = "true";

    const rows = await runPublicEligibility([
      {
        id: "near-existing",
        cleaner_id: CLEANER_ID,
        date: DATE,
        time: "00:00",
        status: "assigned",
        duration_minutes: 240,
      },
    ]);

    expect(rows.map((r) => r.id)).toEqual([CLEANER_ID]);
    expect(metrics.increment).toHaveBeenCalledWith(
      "booking.daily_workload_shadow.flagged_day",
      expect.objectContaining({
        cleanerId: CLEANER_ID,
        riskBand: "risky_near_8h",
        totalScheduledMinutes: 480,
      }),
    );
  });

  it("reports fallback duration usage while keeping the cleaner available when total remains under 8h", async () => {
    process.env.MAX_CLEANER_DAILY_WORKLOAD_ENFORCE_PUBLIC = "true";

    const rows = await runPublicEligibility([
      {
        id: "missing-duration",
        cleaner_id: CLEANER_ID,
        date: DATE,
        time: "00:00",
        status: "assigned",
        duration_minutes: null,
      },
    ]);

    expect(rows.map((r) => r.id)).toEqual([CLEANER_ID]);
    expect(metrics.increment).toHaveBeenCalledWith(
      "booking.daily_workload_shadow.duration_fallback",
      expect.objectContaining({ source: "getEligibleCleaners.public", count: 1 }),
    );
  });

  it("does not count team jobs as solo workload for the public filter", async () => {
    process.env.MAX_CLEANER_DAILY_WORKLOAD_ENFORCE_PUBLIC = "true";

    const rows = await runPublicEligibility([
      {
        id: "team-existing",
        cleaner_id: CLEANER_ID,
        payout_owner_cleaner_id: CLEANER_ID,
        team_id: "team-1",
        is_team_job: true,
        date: DATE,
        time: "00:00",
        status: "assigned",
        duration_minutes: 360,
      },
    ]);

    expect(rows.map((r) => r.id)).toEqual([CLEANER_ID]);
  });

  it("preserves existing overlap logic: overlapping jobs still exclude before workload policy matters", async () => {
    process.env.MAX_CLEANER_DAILY_WORKLOAD_ENFORCE_PUBLIC = "true";

    const rows = await runPublicEligibility([
      {
        id: "overlap-existing",
        cleaner_id: CLEANER_ID,
        date: DATE,
        time: "10:00",
        status: "assigned",
        duration_minutes: 60,
      },
    ], { requestedDurationMinutes: 60 });

    expect(rows).toEqual([]);
  });
});
