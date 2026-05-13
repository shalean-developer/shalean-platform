import type { SupabaseClient } from "@supabase/supabase-js";

import { BOOKING_SLOT_OCCUPYING_STATUSES } from "@/lib/booking/bookingCleanerSlotOccupyingStatuses";
import {
  BOOKING_DURATION_FALLBACK_MINUTES,
  FUTURE_MAX_CLEANER_DAY_MINUTES,
  MIN_REASONABLE_BOOKING_DURATION_MINUTES,
} from "@/lib/booking/durationMinutesIntegrity";
import { metrics } from "@/lib/metrics/counters";

export const DAILY_WORKLOAD_RISKY_MINUTES = 7 * 60;

export type DailyWorkloadJobKind = "solo" | "team";
export type DailyWorkloadRiskBand = "normal" | "risky_near_8h" | "over_8h";

export type DailyWorkloadShadowBookingRow = {
  id?: string | null;
  cleaner_id?: string | null;
  payout_owner_cleaner_id?: string | null;
  team_id?: string | null;
  is_team_job?: boolean | null;
  date?: string | null;
  booking_date?: string | null;
  status?: string | null;
  duration_minutes?: number | null;
};

export type DailyWorkloadFallbackUsage = {
  bookingId: string | null;
  cleanerId: string;
  dateYmd: string;
  jobKind: DailyWorkloadJobKind;
  rawDurationMinutes: number | null;
  fallbackMinutes: number;
};

export type DailyCleanerWorkloadShadowDay = {
  cleanerId: string;
  dateYmd: string;
  jobKind: DailyWorkloadJobKind;
  bookingIds: string[];
  teamIds: string[];
  fallbackBookingIds: string[];
  totalScheduledMinutes: number;
  bookingCount: number;
  fallbackCount: number;
  maxPolicyMinutes: number;
  riskyPolicyMinutes: number;
  riskBand: DailyWorkloadRiskBand;
};

export type DailyWorkloadWarning = {
  code: "daily_workload_near_limit" | "daily_workload_over_limit" | "duration_fallback_used";
  riskBand: DailyWorkloadRiskBand;
  jobKind: DailyWorkloadJobKind;
  totalScheduledMinutes: number;
  maxPolicyMinutes: number;
  riskyPolicyMinutes: number;
  fallbackCount: number;
  fallbackBookingIds: string[];
};

export type DailyCleanerWorkloadShadowReport = {
  days: DailyCleanerWorkloadShadowDay[];
  soloDays: DailyCleanerWorkloadShadowDay[];
  teamDays: DailyCleanerWorkloadShadowDay[];
  riskyDays: DailyCleanerWorkloadShadowDay[];
  overLimitDays: DailyCleanerWorkloadShadowDay[];
  fallbackUsage: DailyWorkloadFallbackUsage[];
  skippedRows: number;
};

function normalizeId(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function normalizeDateYmd(row: DailyWorkloadShadowBookingRow): string | null {
  const raw = row.date ?? row.booking_date ?? null;
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function isTeamJob(row: DailyWorkloadShadowBookingRow): boolean {
  return row.is_team_job === true || normalizeId(row.team_id) != null;
}

function cleanerIdForShadow(row: DailyWorkloadShadowBookingRow, jobKind: DailyWorkloadJobKind): string | null {
  if (jobKind === "team") {
    return normalizeId(row.payout_owner_cleaner_id) ?? normalizeId(row.cleaner_id);
  }
  return normalizeId(row.cleaner_id);
}

function resolveShadowDurationMinutes(row: DailyWorkloadShadowBookingRow): {
  minutes: number;
  usedFallback: boolean;
  rawDurationMinutes: number | null;
} {
  const raw =
    typeof row.duration_minutes === "number" && Number.isFinite(row.duration_minutes)
      ? row.duration_minutes
      : null;
  if (raw != null && raw >= MIN_REASONABLE_BOOKING_DURATION_MINUTES) {
    return { minutes: Math.round(raw), usedFallback: false, rawDurationMinutes: raw };
  }
  return {
    minutes: BOOKING_DURATION_FALLBACK_MINUTES,
    usedFallback: true,
    rawDurationMinutes: raw,
  };
}

function riskBandForMinutes(
  totalScheduledMinutes: number,
  maxPolicyMinutes: number,
  riskyPolicyMinutes: number,
): DailyWorkloadRiskBand {
  if (totalScheduledMinutes > maxPolicyMinutes) return "over_8h";
  if (totalScheduledMinutes >= riskyPolicyMinutes) return "risky_near_8h";
  return "normal";
}

export function buildDailyCleanerWorkloadShadowReport(
  rows: readonly DailyWorkloadShadowBookingRow[],
  opts: {
    maxPolicyMinutes?: number;
    riskyPolicyMinutes?: number;
  } = {},
): DailyCleanerWorkloadShadowReport {
  const maxPolicyMinutes = Math.round(opts.maxPolicyMinutes ?? FUTURE_MAX_CLEANER_DAY_MINUTES);
  const riskyPolicyMinutes = Math.round(opts.riskyPolicyMinutes ?? DAILY_WORKLOAD_RISKY_MINUTES);
  const byCleanerDay = new Map<string, DailyCleanerWorkloadShadowDay>();
  const fallbackUsage: DailyWorkloadFallbackUsage[] = [];
  let skippedRows = 0;

  for (const row of rows) {
    const jobKind: DailyWorkloadJobKind = isTeamJob(row) ? "team" : "solo";
    const cleanerId = cleanerIdForShadow(row, jobKind);
    const dateYmd = normalizeDateYmd(row);
    if (!cleanerId || !dateYmd) {
      skippedRows += 1;
      continue;
    }

    const duration = resolveShadowDurationMinutes(row);
    const key = `${jobKind}:${cleanerId}:${dateYmd}`;
    const existing =
      byCleanerDay.get(key) ??
      ({
        cleanerId,
        dateYmd,
        jobKind,
        bookingIds: [],
        teamIds: [],
        fallbackBookingIds: [],
        totalScheduledMinutes: 0,
        bookingCount: 0,
        fallbackCount: 0,
        maxPolicyMinutes,
        riskyPolicyMinutes,
        riskBand: "normal",
      } satisfies DailyCleanerWorkloadShadowDay);

    const bookingId = normalizeId(row.id);
    if (bookingId) existing.bookingIds.push(bookingId);
    const teamId = normalizeId(row.team_id);
    if (teamId && !existing.teamIds.includes(teamId)) existing.teamIds.push(teamId);
    existing.bookingCount += 1;
    existing.totalScheduledMinutes += duration.minutes;

    if (duration.usedFallback) {
      if (bookingId) existing.fallbackBookingIds.push(bookingId);
      existing.fallbackCount += 1;
      fallbackUsage.push({
        bookingId,
        cleanerId,
        dateYmd,
        jobKind,
        rawDurationMinutes: duration.rawDurationMinutes,
        fallbackMinutes: BOOKING_DURATION_FALLBACK_MINUTES,
      });
    }

    existing.riskBand = riskBandForMinutes(
      existing.totalScheduledMinutes,
      existing.maxPolicyMinutes,
      existing.riskyPolicyMinutes,
    );
    byCleanerDay.set(key, existing);
  }

  const days = [...byCleanerDay.values()].sort((a, b) =>
    `${a.dateYmd}:${a.jobKind}:${a.cleanerId}`.localeCompare(`${b.dateYmd}:${b.jobKind}:${b.cleanerId}`),
  );
  return {
    days,
    soloDays: days.filter((d) => d.jobKind === "solo"),
    teamDays: days.filter((d) => d.jobKind === "team"),
    riskyDays: days.filter((d) => d.riskBand === "risky_near_8h"),
    overLimitDays: days.filter((d) => d.riskBand === "over_8h"),
    fallbackUsage,
    skippedRows,
  };
}

export function warningFromDailyWorkloadShadowDay(
  day: DailyCleanerWorkloadShadowDay | null | undefined,
): DailyWorkloadWarning | null {
  if (!day) return null;
  if (day.riskBand === "over_8h") {
    return {
      code: "daily_workload_over_limit",
      riskBand: day.riskBand,
      jobKind: day.jobKind,
      totalScheduledMinutes: day.totalScheduledMinutes,
      maxPolicyMinutes: day.maxPolicyMinutes,
      riskyPolicyMinutes: day.riskyPolicyMinutes,
      fallbackCount: day.fallbackCount,
      fallbackBookingIds: [...day.fallbackBookingIds],
    };
  }
  if (day.riskBand === "risky_near_8h") {
    return {
      code: "daily_workload_near_limit",
      riskBand: day.riskBand,
      jobKind: day.jobKind,
      totalScheduledMinutes: day.totalScheduledMinutes,
      maxPolicyMinutes: day.maxPolicyMinutes,
      riskyPolicyMinutes: day.riskyPolicyMinutes,
      fallbackCount: day.fallbackCount,
      fallbackBookingIds: [...day.fallbackBookingIds],
    };
  }
  if (day.fallbackCount > 0) {
    return {
      code: "duration_fallback_used",
      riskBand: day.riskBand,
      jobKind: day.jobKind,
      totalScheduledMinutes: day.totalScheduledMinutes,
      maxPolicyMinutes: day.maxPolicyMinutes,
      riskyPolicyMinutes: day.riskyPolicyMinutes,
      fallbackCount: day.fallbackCount,
      fallbackBookingIds: [...day.fallbackBookingIds],
    };
  }
  return null;
}

export function reportDailyCleanerWorkloadShadow(
  report: DailyCleanerWorkloadShadowReport,
  opts: { source?: string | null } = {},
): void {
  const source = opts.source?.trim() || "daily_cleaner_workload_shadow";
  metrics.increment("booking.daily_workload_shadow.summary", {
    source,
    dayCount: report.days.length,
    soloDayCount: report.soloDays.length,
    teamDayCount: report.teamDays.length,
    riskyDayCount: report.riskyDays.length,
    overLimitDayCount: report.overLimitDays.length,
    fallbackCount: report.fallbackUsage.length,
    skippedRows: report.skippedRows,
  });

  for (const day of [...report.riskyDays, ...report.overLimitDays]) {
    metrics.increment("booking.daily_workload_shadow.flagged_day", {
      source,
      cleanerId: day.cleanerId,
      dateYmd: day.dateYmd,
      jobKind: day.jobKind,
      riskBand: day.riskBand,
      totalScheduledMinutes: day.totalScheduledMinutes,
      bookingCount: day.bookingCount,
      fallbackCount: day.fallbackCount,
      maxPolicyMinutes: day.maxPolicyMinutes,
      riskyPolicyMinutes: day.riskyPolicyMinutes,
    });
  }

  if (report.fallbackUsage.length > 0) {
    metrics.increment("booking.daily_workload_shadow.duration_fallback", {
      source,
      count: report.fallbackUsage.length,
    });
  }
}

export async function scanDailyCleanerWorkloadShadow(
  admin: SupabaseClient,
  params: {
    dateFromYmd: string;
    dateToYmd: string;
    statuses?: readonly string[];
  },
): Promise<{ ok: true; report: DailyCleanerWorkloadShadowReport } | { ok: false; error: string }> {
  const statuses = params.statuses ?? [...BOOKING_SLOT_OCCUPYING_STATUSES];
  const { data, error } = await admin
    .from("bookings")
    .select("id, cleaner_id, payout_owner_cleaner_id, team_id, is_team_job, date, booking_date, status, duration_minutes")
    .in("status", [...statuses])
    .gte("date", params.dateFromYmd)
    .lte("date", params.dateToYmd);

  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    report: buildDailyCleanerWorkloadShadowReport(
      Array.isArray(data) ? (data as DailyWorkloadShadowBookingRow[]) : [],
    ),
  };
}
