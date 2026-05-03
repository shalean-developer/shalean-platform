/**
 * Upcoming-job schedule UX: wall times and “minutes until start” use Africa/Johannesburg (SAST, UTC+2).
 * Display-only; does not change booking data or APIs.
 */

import { johannesburgCalendarYmd, johannesburgCalendarYmdAddDays } from "@/lib/dashboard/johannesburgMonth";
import { jobDateHeading } from "@/lib/cleaner/cleanerJobCardFormat";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import type { CleanerJobLifecycleSlot } from "@/lib/cleaner/cleanerMobileBookingMap";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";

const JHB_OFFSET = "+02:00";

/** Instant (epoch ms) for booking start interpreted in Johannesburg. */
export function parseJobStartJohannesburgInstantMs(dateStr: string, timeStr: string): number | null {
  const ymd = dateStr.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const raw = timeStr.trim();
  if (!raw) {
    const t = Date.parse(`${ymd}T00:00:00${JHB_OFFSET}`);
    return Number.isNaN(t) ? null : t;
  }
  const m = raw.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  const pm = /\bpm\b/i.test(raw);
  const am = /\bam\b/i.test(raw);
  if (pm && hour < 12) hour += 12;
  if (am && hour === 12) hour = 0;
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  const t = Date.parse(`${ymd}T${hh}:${mm}:00${JHB_OFFSET}`);
  return Number.isNaN(t) ? null : t;
}

/** Positive = before start, negative = after start (late). */
export function minutesUntilJobStartJohannesburg(dateStr: string, timeStr: string, now = new Date()): number | null {
  const ms = parseJobStartJohannesburgInstantMs(dateStr, timeStr);
  if (ms == null) return null;
  return (ms - now.getTime()) / 60000;
}

export function formatJobTimeHHmm24ForDisplay(timeStr: string): string {
  const raw = timeStr.trim();
  const m = raw.match(/(\d{1,2}):(\d{2})/);
  if (!m) return raw || "—";
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return raw || "—";
  const pm = /\bpm\b/i.test(raw);
  const am = /\bam\b/i.test(raw);
  if (pm && hour < 12) hour += 12;
  if (am && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Dominant schedule line: "In 45 min", "Today · 14:00", "Tomorrow · 09:00", or dated heading.
 * Relative "In N min" only for same JHB calendar day as `now`, 0 < minutes ≤ 120.
 */
export function formatUpcomingSchedulePrimaryTimeLine(dateStr: string, timeStr: string, now = new Date()): string {
  const startMs = parseJobStartJohannesburgInstantMs(dateStr, timeStr);
  const clock = formatJobTimeHHmm24ForDisplay(timeStr);
  const jobYmd = dateStr.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jobYmd)) {
    return `${jobDateHeading(dateStr, now)} · ${clock}`;
  }
  if (startMs == null) {
    return `${jobDateHeading(dateStr, now)} · ${clock}`;
  }
  const mins = (startMs - now.getTime()) / 60000;
  const todayYmd = johannesburgCalendarYmd(now);
  if (jobYmd === todayYmd) {
    if (mins > 0 && mins <= 120) {
      return `In ${Math.max(1, Math.round(mins))} min`;
    }
    return `Today · ${clock}`;
  }
  const tomorrowYmd = johannesburgCalendarYmdAddDays(todayYmd, 1);
  if (jobYmd === tomorrowYmd) {
    return `Tomorrow · ${clock}`;
  }
  return `${jobDateHeading(dateStr, now)} · ${clock}`;
}

export type UpcomingScheduleStatusChip = "starting_soon" | "upcoming" | "late" | "in_progress";

/** “Late” / travel nudges only after the cleaner has accepted (or is already travelling / on site). */
export function cleanerPastAcceptStageForSchedule(
  row: Pick<CleanerBookingRow, "cleaner_response_status" | "en_route_at">,
): boolean {
  if (row.en_route_at) return true;
  const r = String(row.cleaner_response_status ?? "")
    .trim()
    .toLowerCase();
  return (
    r === CLEANER_RESPONSE.ACCEPTED ||
    r === CLEANER_RESPONSE.ON_MY_WAY ||
    r === CLEANER_RESPONSE.STARTED
  );
}

export function upcomingScheduleStatusChip(
  row: Pick<CleanerBookingRow, "status" | "cleaner_response_status" | "en_route_at">,
  minutesUntilStart: number | null,
): UpcomingScheduleStatusChip {
  const st = String(row.status ?? "").toLowerCase();
  if (st === "in_progress") return "in_progress";
  const pastAccept = cleanerPastAcceptStageForSchedule(row);
  if (minutesUntilStart != null && minutesUntilStart < 0 && pastAccept) return "late";
  if (minutesUntilStart != null && minutesUntilStart < 0 && !pastAccept) return "upcoming";
  if (minutesUntilStart != null && minutesUntilStart <= 90) return "starting_soon";
  return "upcoming";
}

export function upcomingScheduleStatusChipLabel(chip: UpcomingScheduleStatusChip): string {
  if (chip === "in_progress") return "In progress";
  if (chip === "late") return "Late";
  if (chip === "starting_soon") return "Starting soon";
  return "Upcoming";
}

export function upcomingTravelMicroNudge(
  minutesUntilStart: number | null,
  row?: Pick<CleanerBookingRow, "cleaner_response_status" | "en_route_at"> | null,
): string | null {
  if (minutesUntilStart == null) return null;
  if (row && !cleanerPastAcceptStageForSchedule(row)) return null;
  if (minutesUntilStart < 0) return "Start now to avoid delays";
  if (minutesUntilStart > 0 && minutesUntilStart <= 30) return "Start travel now";
  if (minutesUntilStart > 30 && minutesUntilStart <= 60) return "Leave soon to arrive on time";
  return null;
}

export type UpcomingLifecycleAction = "accept" | "reject" | "en_route" | "start" | "complete";

export type UpcomingPrimaryCta =
  | { kind: "none" }
  | { kind: "view_details" }
  | {
      kind: "lifecycle";
      action: UpcomingLifecycleAction;
      label: string;
      opts?: { teamAvailabilityConfirm?: boolean; scheduleSummary?: string };
    };

/** On-site / in-progress card: only start or complete, no travel urgency. */
export function resolveInProgressPrimaryCta(lifecycle: CleanerJobLifecycleSlot): UpcomingPrimaryCta {
  if (!lifecycle) return { kind: "none" };
  if (lifecycle.kind === "complete") {
    return { kind: "lifecycle", action: "complete", label: "Complete Job" };
  }
  if (lifecycle.kind === "start") {
    return { kind: "lifecycle", action: "start", label: "Start Job" };
  }
  return { kind: "none" };
}

export function resolveUpcomingPrimaryCta(
  lifecycle: CleanerJobLifecycleSlot,
  _minutesUntilStart: number | null,
): UpcomingPrimaryCta {
  if (!lifecycle) return { kind: "none" };
  if (lifecycle.kind === "accept_reject" || lifecycle.kind === "offer_expired") return { kind: "none" };
  if (lifecycle.kind === "complete") return { kind: "lifecycle", action: "complete", label: "Complete Job" };
  if (lifecycle.kind === "start") return { kind: "lifecycle", action: "start", label: "Start Job" };
  if (lifecycle.kind === "en_route") return { kind: "lifecycle", action: "en_route", label: "On my way" };
  return { kind: "none" };
}

export function compareCleanerBookingStartJohannesburg(
  a: CleanerBookingRow,
  b: CleanerBookingRow,
): number {
  const ta = parseJobStartJohannesburgInstantMs(String(a.date ?? ""), String(a.time ?? ""));
  const tb = parseJobStartJohannesburgInstantMs(String(b.date ?? ""), String(b.time ?? ""));
  if (ta == null && tb == null) {
    return String(a.date ?? "").localeCompare(String(b.date ?? "")) || String(a.time ?? "").localeCompare(String(b.time ?? ""));
  }
  if (ta == null) return 1;
  if (tb == null) return -1;
  return ta - tb;
}

export function earliestOpenBookingId(rows: CleanerBookingRow[]): string | null {
  const stOf = (r: CleanerBookingRow) => String(r.status ?? "").toLowerCase();
  const open = rows.filter((r) => stOf(r) !== "completed" && stOf(r) !== "cancelled");
  if (open.length === 0) return null;
  const sorted = [...open].sort(compareCleanerBookingStartJohannesburg);
  const id = String(sorted[0]?.id ?? "").trim();
  return id || null;
}
