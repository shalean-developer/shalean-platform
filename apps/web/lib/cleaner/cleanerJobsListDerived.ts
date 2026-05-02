import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { buildUnifiedJobScope } from "@/lib/cleaner/cleanerJobDetailUnifiedScope";
import { latenessVsSchedule } from "@/lib/cleaner/cleanerJobDetailScheduleModel";
import { adaptiveWeeklyEarningsGoalZar, cleanerFacingDisplayEarningsCents } from "@/lib/cleaner/cleanerMobileBookingMap";
import { jobStartMsJohannesburg } from "@/lib/cleaner/jobStartJohannesburgMs";
import { johannesburgCalendarYmd } from "@/lib/dashboard/johannesburgMonth";
import { addDaysYmd, isoWeekdayFromYmd } from "@/lib/recurring/johannesburgCalendar";

/** Typical travel / buffer before scheduled start (navigation heuristic). */
export const CLEANER_JOBS_LEAVE_BUFFER_MIN = 25;

/** Mon–Sun ISO week range (Africa/Johannesburg civil dates) containing `ymd`. */
export function johannesburgIsoWeekRangeContainingYmd(ymd: string): { startYmd: string; endYmd: string } {
  const d = ymd.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const today = johannesburgCalendarYmd(new Date());
    return johannesburgIsoWeekRangeContainingYmd(today);
  }
  const wd = isoWeekdayFromYmd(d);
  const startYmd = addDaysYmd(d, -(wd - 1));
  const endYmd = addDaysYmd(startYmd, 6);
  return { startYmd, endYmd };
}

function ymdInJohannesburgFromIsoTimestamp(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const t = new Date(iso.trim()).getTime();
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(new Date(t));
}

/** Suburb (or area) first, street second — for two-line layout on cards. */
export function splitJobLocationPrimarySecondary(location: string | null | undefined): {
  primary: string;
  secondary: string | null;
} {
  const raw = location?.trim() ?? "";
  if (!raw) return { primary: "Area on file", secondary: null };
  const line = raw.split(/\r?\n/)[0]?.trim() ?? "";
  const parts = line.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const street = parts[0] ?? "";
    const suburb = parts[1] ?? "";
    if (street && suburb) return { primary: suburb, secondary: street };
    return { primary: parts.join(" · "), secondary: null };
  }
  return { primary: line || "Area on file", secondary: null };
}

/** Legacy single-line (suburb • street); prefer {@link splitJobLocationPrimarySecondary} on new UI. */
export function formatJobLocationSubtitle(location: string | null | undefined): string {
  const { primary, secondary } = splitJobLocationPrimarySecondary(location);
  return secondary ? `${primary} • ${secondary}` : primary;
}

/** Compact scope: `3 Bed • 2 Bath • + Oven`; drops extras first so bed/bath are never truncated for length. */
export function formatJobScopeCompactLine(row: CleanerBookingRow): string | null {
  const u = buildUnifiedJobScope({ ...row, scope_lines: row.scope_lines ?? undefined });
  const core: string[] = [];
  const rooms = row.rooms;
  const baths = row.bathrooms;
  if (typeof rooms === "number" && Number.isFinite(rooms) && rooms > 0) {
    core.push(`${rooms} Bed`);
  }
  if (typeof baths === "number" && Number.isFinite(baths) && baths > 0) {
    core.push(`${baths} Bath`);
  }
  if (core.length === 0 && u.propertyLine) {
    core.push(u.propertyLine);
  }
  const extraTokens: string[] = [];
  for (const ex of u.extras) {
    const label = ex.trim();
    if (!label) continue;
    extraTokens.push(`+ ${label}`);
  }
  const join = (a: string[]) => a.filter(Boolean).join(" • ");
  const max = 52;
  let extras = [...extraTokens];
  let line = join([...core, ...extras]);
  while (line.length > max && extras.length > 0) {
    extras.pop();
    line = join([...core, ...extras]);
  }
  if (line.length > max && core.length > 0) {
    const coreLine = join(core);
    return coreLine.length > max ? `${coreLine.slice(0, max - 1)}…` : coreLine;
  }
  return line || null;
}

export function isOpenCleanerJobRow(row: CleanerBookingRow): boolean {
  const s = String(row.status ?? "").toLowerCase();
  return Boolean(s) && s !== "completed" && s !== "cancelled";
}

export function isCompletedCleanerJobRow(row: CleanerBookingRow): boolean {
  return String(row.status ?? "").toLowerCase() === "completed";
}

export type ThisWeekSummary = {
  scheduledCount: number;
  /** Completed jobs whose completion day falls in the ISO week (JHB). */
  completedCountInWeek: number;
  earnedCents: number;
  weekStartYmd: string;
  weekEndYmd: string;
};

/** Scheduled jobs (by `bookings.date`) in the week, non-cancelled; earned from completions in the same JHB week. */
export function summarizeCleanerJobsThisIsoWeek(rows: readonly CleanerBookingRow[], now = new Date()): ThisWeekSummary {
  const todayYmd = johannesburgCalendarYmd(now);
  const { startYmd, endYmd } = johannesburgIsoWeekRangeContainingYmd(todayYmd);
  let scheduledCount = 0;
  let earnedCents = 0;
  let completedCountInWeek = 0;
  for (const r of rows) {
    const d = String(r.date ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (d < startYmd || d > endYmd) continue;
    const st = String(r.status ?? "").toLowerCase();
    if (st === "cancelled") continue;
    scheduledCount += 1;
  }
  for (const r of rows) {
    if (!isCompletedCleanerJobRow(r)) continue;
    const completionYmd = ymdInJohannesburgFromIsoTimestamp(r.completed_at) ?? String(r.date ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(completionYmd)) continue;
    if (completionYmd < startYmd || completionYmd > endYmd) continue;
    const c = cleanerFacingDisplayEarningsCents(r);
    if (c != null) earnedCents += c;
    completedCountInWeek += 1;
  }
  return { scheduledCount, completedCountInWeek, earnedCents, weekStartYmd: startYmd, weekEndYmd: endYmd };
}

export type CleanerJobUrgencyUi = {
  startsInText: string | null;
  /** True when start is soon (≤15 min) — show ⚠️ styling. */
  startsInWarn: boolean;
  leaveText: string | null;
  lateText: string | null;
  /** Mild late (≤15 min past) vs severe — drives colour + pulse. */
  lateLevel: "none" | "amber" | "redPulse";
};

/**
 * Starts-in / leave / late copy for open jobs (JHB start instant).
 * `in_progress` / terminal → no countdown (not “late” once work has started).
 */
export function getCleanerJobUrgencyUi(row: CleanerBookingRow, nowMs: number): CleanerJobUrgencyUi {
  const empty = (): CleanerJobUrgencyUi => ({
    startsInText: null,
    startsInWarn: false,
    leaveText: null,
    lateText: null,
    lateLevel: "none",
  });

  const st = String(row.status ?? "").toLowerCase();
  if (st === "completed" || st === "cancelled" || st === "failed") return empty();
  if (st === "in_progress") return empty();

  const startMs = jobStartMsJohannesburg(row.date, row.time);
  if (startMs == null) return empty();

  const late = latenessVsSchedule({ status: st, startMs, nowMs });
  if (late.kind === "late") {
    const severe = late.severe;
    return {
      startsInText: null,
      startsInWarn: false,
      leaveText: null,
      lateText: severe ? `🔴 Running ${late.minutes} min late` : `Running ${late.minutes} min late`,
      lateLevel: severe ? "redPulse" : "amber",
    };
  }

  const diffMs = startMs - nowMs;
  const untilStartMin = diffMs / 60000;
  const ceilMin = Math.ceil(diffMs / 60000);

  let startsInText: string | null = null;
  let startsInWarn = false;
  if (diffMs > 0) {
    if (diffMs <= 60_000) {
      startsInText = "Starts now";
      startsInWarn = true;
    } else if (ceilMin < 60) {
      startsInWarn = ceilMin <= 15;
      startsInText = startsInWarn ? `Starts in ${ceilMin} min ⚠️` : `Starts in ${ceilMin} min`;
    } else {
      const h = Math.floor(ceilMin / 60);
      const m = ceilMin % 60;
      startsInWarn = false;
      if (ceilMin < 24 * 60) {
        startsInText = m > 0 ? `Starts in ${h}h ${m}m` : `Starts in ${h}h`;
      } else {
        const days = Math.floor(ceilMin / (24 * 60));
        if (days <= 14) startsInText = `Starts in ${days} day${days === 1 ? "" : "s"}`;
      }
    }
  } else if (diffMs > -60_000) {
    startsInText = "Starts now";
    startsInWarn = true;
  }

  /** Only show “leave in” when start is close enough to be actionable (~3h). */
  const leaveWindowMin = 180;
  let leaveText: string | null = null;
  if (diffMs > 0 && untilStartMin <= leaveWindowMin) {
    const leaveLeadMin = untilStartMin - CLEANER_JOBS_LEAVE_BUFFER_MIN;
    if (leaveLeadMin > 1) {
      leaveText = `Leave in ${Math.floor(leaveLeadMin)} min`;
    } else if (untilStartMin > 0) {
      leaveText = "Leave now";
    }
  }

  return { startsInText, startsInWarn, leaveText, lateText: null, lateLevel: "none" };
}

/** Poll interval for jobs list “live” urgency (1s / 10s / 60s). */
export function jobsListAdaptivePollMs(rows: readonly CleanerBookingRow[], nowMs: number): number {
  let interval = 60_000;
  for (const r of rows) {
    if (!isOpenCleanerJobRow(r)) continue;
    const st = String(r.status ?? "").toLowerCase();
    if (st === "in_progress") continue;
    const startMs = jobStartMsJohannesburg(r.date, r.time);
    if (startMs == null) continue;
    const late = latenessVsSchedule({ status: st, startMs, nowMs });
    if (late.kind === "late") {
      interval = late.severe ? 1000 : Math.min(interval, 10_000);
      continue;
    }
    const mins = (startMs - nowMs) / 60000;
    if (mins > 0 && mins <= 3) return 1000;
    if (mins > 0 && mins <= 15) interval = Math.min(interval, 10_000);
  }
  return interval;
}

export function sortUpcomingJobsAsc(rows: CleanerBookingRow[]): CleanerBookingRow[] {
  return [...rows].sort((a, b) => {
    const ma = jobStartMsJohannesburg(a.date, a.time);
    const mb = jobStartMsJohannesburg(b.date, b.time);
    if (ma != null && mb != null && ma !== mb) return ma - mb;
    if (ma != null && mb == null) return -1;
    if (ma == null && mb != null) return 1;
    return (
      String(a.date ?? "").localeCompare(String(b.date ?? "")) || String(a.time ?? "").localeCompare(String(b.time ?? ""))
    );
  });
}

function pastSortStampMs(r: CleanerBookingRow): number {
  const raw = r.completed_at;
  if (raw) {
    const t = new Date(String(raw)).getTime();
    if (Number.isFinite(t)) return t;
  }
  const j = jobStartMsJohannesburg(r.date, r.time);
  if (j != null) return j;
  const cr = r.created_at ? new Date(String(r.created_at)).getTime() : 0;
  return Number.isFinite(cr) ? cr : 0;
}

export function sortPastJobsDesc(rows: CleanerBookingRow[]): CleanerBookingRow[] {
  return [...rows].sort((a, b) => pastSortStampMs(b) - pastSortStampMs(a));
}

/** Trailing 7-day completed earnings (ZAR whole) + gap to adaptive weekly goal. */
export function trailingWeekGoalGapZar(rows: readonly CleanerBookingRow[], now = new Date()): {
  earnedTrailingZar: number;
  goalZar: number;
  remainderZar: number;
} {
  const cutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  let earnedTrailingZar = 0;
  for (const r of rows) {
    if (String(r.status ?? "").toLowerCase() !== "completed") continue;
    const raw = r.completed_at ?? r.date;
    if (!raw) continue;
    const t = new Date(String(raw)).getTime();
    if (!Number.isFinite(t) || t < cutoff) continue;
    const c = cleanerFacingDisplayEarningsCents(r);
    if (c == null) continue;
    earnedTrailingZar += Math.round(c / 100);
  }
  const goalZar = adaptiveWeeklyEarningsGoalZar(rows as CleanerBookingRow[], now);
  const remainderZar = Math.max(0, goalZar - earnedTrailingZar);
  return { earnedTrailingZar, goalZar, remainderZar };
}

export function groupRowsByBookingDateDesc(rows: CleanerBookingRow[]): Map<string, CleanerBookingRow[]> {
  const sorted = sortPastJobsDesc(rows);
  const map = new Map<string, CleanerBookingRow[]>();
  for (const r of sorted) {
    const key = String(r.date ?? "").slice(0, 10) || "—";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return map;
}
