import { jobStartMsJohannesburg } from "@/lib/cleaner/jobStartJohannesburgMs";
import { formatTakesAboutJobHoursLine } from "@/lib/cleaner/cleanerMobileBookingMap";

export function formatClockJhb(ms: number): string {
  try {
    return new Intl.DateTimeFormat("en-ZA", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Johannesburg",
    }).format(new Date(ms));
  } catch {
    return "—";
  }
}

export type ScheduleHintModel = {
  startMs: number | null;
  startLabel: string | null;
  durText: string | null;
  endRange: string | null;
};

export function buildScheduleHintModel(params: {
  date: string | null | undefined;
  time: string | null | undefined;
  duration_hours: number | null | undefined;
}): ScheduleHintModel {
  const startMs = jobStartMsJohannesburg(params.date, params.time);
  const h =
    typeof params.duration_hours === "number" && Number.isFinite(params.duration_hours) && params.duration_hours > 0
      ? params.duration_hours
      : null;
  const startLabel = startMs != null ? formatClockJhb(startMs) : String(params.time ?? "").trim() || null;
  const durText =
    h != null
      ? (() => {
          const raw = formatTakesAboutJobHoursLine(h);
          return raw ? raw.replace(/^Takes ~/, "") : null;
        })()
      : null;
  let endRange: string | null = null;
  if (startMs != null && h != null) {
    const lo = startMs + Math.floor(h) * 3600000;
    const hi = startMs + Math.ceil(h) * 3600000;
    if (lo === hi) endRange = `~${formatClockJhb(lo)}`;
    else endRange = `${formatClockJhb(lo)}–${formatClockJhb(hi)}`;
  }
  return { startMs, startLabel, durText, endRange };
}

export type LatenessUi =
  | { kind: "late"; minutes: number; severe: boolean }
  | { kind: "early"; minutes: number }
  | { kind: "none" };

/**
 * Compares server-anchored “now” to scheduled start. Only meaningful before `in_progress`
 * (still scheduled travel / arrival).
 */
export function latenessVsSchedule(params: {
  status: string;
  startMs: number | null;
  nowMs: number;
}): LatenessUi {
  const st = String(params.status ?? "").toLowerCase();
  if (!params.startMs) return { kind: "none" };
  if (st === "completed" || st === "cancelled" || st === "failed" || st === "in_progress") return { kind: "none" };

  const deltaMin = (params.nowMs - params.startMs) / 60_000;
  if (deltaMin >= 1) {
    const minutes = Math.round(deltaMin);
    return { kind: "late", minutes: Math.max(1, minutes), severe: minutes > 15 };
  }
  if (deltaMin <= -5) {
    const minutes = Math.round(-deltaMin);
    return { kind: "early", minutes: Math.max(5, minutes) };
  }
  return { kind: "none" };
}
