import { formatIsoInJohannesburgYmd, todayYmdJohannesburg } from "@/lib/booking/dateInJohannesburg";
import { bookingScheduledStartUtcMs } from "@/lib/admin/opsSnapshot";
import {
  resolveReportingDurationMinutes,
  type BookingDurationReportingRow,
} from "@/lib/admin/reporting/bookingDurationReporting";

export type BookingPerfInput = BookingDurationReportingRow & {
  cleaner_id: string | null;
  date: string | null;
  time: string | null;
  started_at: string | null;
  completed_at: string | null;
  status: string | null;
};

export type CleanerPerfRow = {
  cleanerId: string;
  cleanerName: string;
  jobsCompleted: number;
  punctualityJobs: number;
  onTimeRate: number;
  avgLateMinutes: number;
  completionDenominator: number;
  completionRate: number;
  /** Average persisted scheduled duration among completed jobs. */
  avgJobDurationMinutes: number;
  scheduledDurationSamples: number;
  /** Wall-clock average (started_at → completed_at) when both timestamps exist. */
  avgActualDurationMinutes: number;
  reliabilityScore: number;
  lowSample: boolean;
};

export type FleetDayTrend = {
  day: string;
  /** Null when no completed jobs had a valid on-time sample that day. */
  onTimePct: number | null;
  completedJobs: number;
};

/** Ignore punctuality rows with implausible lateness (bad timestamps / backfills). */
export const MAX_PUNCTUALITY_LATE_MINUTES = 180;

function parseTs(iso: string | null | undefined): number | null {
  if (!iso || !String(iso).trim()) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

function st(s: string | null | undefined): string {
  return String(s ?? "").toLowerCase().trim();
}

function bookingYmd(date: string | null | undefined): string | null {
  const d = String(date ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00+02:00`);
  d.setDate(d.getDate() + days);
  return formatIsoInJohannesburgYmd(d.toISOString());
}

const TERMINAL = new Set(["completed", "cancelled", "failed"]);

type Acc = {
  jobsCompleted: number;
  terminal: number;
  completedTerminal: number;
  punctualityJobs: number;
  onTimeJobs: number;
  sumPositiveLateMinutes: number;
  sumLateAmongLate: number;
  lateCount: number;
  scheduledDurationCount: number;
  sumScheduledDurationMinutes: number;
  actualDurationCount: number;
  sumActualDurationMinutes: number;
};

function emptyAcc(): Acc {
  return {
    jobsCompleted: 0,
    terminal: 0,
    completedTerminal: 0,
    punctualityJobs: 0,
    onTimeJobs: 0,
    sumPositiveLateMinutes: 0,
    sumLateAmongLate: 0,
    lateCount: 0,
    scheduledDurationCount: 0,
    sumScheduledDurationMinutes: 0,
    actualDurationCount: 0,
    sumActualDurationMinutes: 0,
  };
}

export type PunctualitySample = {
  onTime: boolean;
  lateMinutes: number;
};

/**
 * Punctuality only when the cleaner started on the booking's scheduled calendar day (Johannesburg)
 * and lateness vs the slot is within {@link MAX_PUNCTUALITY_LATE_MINUTES}.
 */
export function punctualitySampleForBooking(b: BookingPerfInput): PunctualitySample | null {
  const ymd = bookingYmd(b.date);
  const sched = bookingScheduledStartUtcMs(b.date, b.time);
  const startedIso = b.started_at?.trim();
  const started = parseTs(startedIso);
  if (!ymd || sched == null || !startedIso || started == null) return null;

  if (formatIsoInJohannesburgYmd(startedIso) !== ymd) return null;

  const rawLateMin = (started - sched) / 60_000;
  if (rawLateMin > MAX_PUNCTUALITY_LATE_MINUTES) return null;

  const lateMinutes = Math.max(0, rawLateMin);
  return {
    onTime: started <= sched,
    lateMinutes,
  };
}

function applyPunctuality(acc: Acc, sample: PunctualitySample): void {
  acc.punctualityJobs++;
  acc.sumPositiveLateMinutes += sample.lateMinutes;
  if (sample.onTime) {
    acc.onTimeJobs++;
  } else {
    acc.sumLateAmongLate += sample.lateMinutes;
    acc.lateCount++;
  }
}

/**
 * Reliability score (0–100):
 * (on_time_rate × 0.4) + (completion_rate × 0.4) + (lateness_penalty × 0.2),
 * lateness_penalty = clamp(0,1, 1 − min(avgLateMinutes/45, 1)) using avg lateness among late jobs only.
 */
export function aggregateCleanerPerformance(
  bookings: BookingPerfInput[],
  cleanerNames: Map<string, string>,
  now = new Date(),
): { cleaners: CleanerPerfRow[]; fleetTrend7d: FleetDayTrend[] } {
  const acc = new Map<string, Acc>();

  const anchorYmd = todayYmdJohannesburg(now);
  const trendBuckets = new Map<string, { onTime: number; eligible: number; completed: number }>();

  for (let i = 0; i < 7; i++) {
    const dayKey = addDaysYmd(anchorYmd, i - 6);
    trendBuckets.set(dayKey, { onTime: 0, eligible: 0, completed: 0 });
  }

  for (const b of bookings) {
    const cid = b.cleaner_id?.trim();
    if (!cid) continue;
    const status = st(b.status);

    let a = acc.get(cid);
    if (!a) {
      a = emptyAcc();
      acc.set(cid, a);
    }

    const punctuality = punctualitySampleForBooking(b);

    if (status === "completed") {
      a.jobsCompleted++;
      const cAt = parseTs(b.completed_at);
      if (cAt != null) {
        const dayKey = formatIsoInJohannesburgYmd(b.completed_at!);
        const tb = trendBuckets.get(dayKey);
        if (tb) tb.completed++;
      }
    }

    if (TERMINAL.has(status)) {
      a.terminal++;
      if (status === "completed") a.completedTerminal++;
    }

    if (punctuality) {
      applyPunctuality(a, punctuality);

      if (status === "completed" && b.completed_at) {
        const dayKey = formatIsoInJohannesburgYmd(b.completed_at);
        const tb = trendBuckets.get(dayKey);
        if (tb) {
          tb.eligible++;
          if (punctuality.onTime) tb.onTime++;
        }
      }
    }

    if (status === "completed") {
      const scheduledMin = resolveReportingDurationMinutes(b);
      if (scheduledMin != null && scheduledMin > 0 && scheduledMin <= 24 * 60) {
        a.scheduledDurationCount++;
        a.sumScheduledDurationMinutes += scheduledMin;
      }
    }

    const started = parseTs(b.started_at);
    if (status === "completed" && started != null) {
      const completedAt = parseTs(b.completed_at);
      if (completedAt != null && completedAt > started) {
        const durationMin = (completedAt - started) / 60_000;
        if (durationMin > 0 && durationMin <= 24 * 60) {
          a.actualDurationCount++;
          a.sumActualDurationMinutes += durationMin;
        }
      }
    }
  }

  const cleaners: CleanerPerfRow[] = [];

  for (const [cleanerId, a] of acc) {
    const punctualityJobs = a.punctualityJobs;
    const onTimeRate = punctualityJobs > 0 ? a.onTimeJobs / punctualityJobs : 0.5;

    const avgLateAmongLate = a.lateCount > 0 ? a.sumLateAmongLate / a.lateCount : 0;
    const latenessPenalty = Math.max(0, Math.min(1, 1 - Math.min(avgLateAmongLate / 45, 1)));

    const completionDenominator = a.terminal;
    const completionRate =
      completionDenominator > 0 ? a.completedTerminal / completionDenominator : punctualityJobs > 0 ? 0.5 : 0.5;

    const rawScore = onTimeRate * 0.4 + completionRate * 0.4 + latenessPenalty * 0.2;
    const reliabilityScore = Math.round(Math.max(0, Math.min(100, rawScore * 100)));

    const avgJobDurationMinutes =
      a.scheduledDurationCount > 0 ? a.sumScheduledDurationMinutes / a.scheduledDurationCount : 0;
    const avgActualDurationMinutes =
      a.actualDurationCount > 0 ? a.sumActualDurationMinutes / a.actualDurationCount : 0;

    const lowSample = completionDenominator < 3 && punctualityJobs < 3;

    const avgLateMinutes =
      punctualityJobs > 0 ? Math.round((a.sumPositiveLateMinutes / punctualityJobs) * 10) / 10 : 0;

    cleaners.push({
      cleanerId,
      cleanerName: cleanerNames.get(cleanerId)?.trim() || "Unknown cleaner",
      jobsCompleted: a.jobsCompleted,
      punctualityJobs,
      onTimeRate,
      avgLateMinutes,
      completionDenominator,
      completionRate,
      avgJobDurationMinutes: Math.round(avgJobDurationMinutes * 10) / 10,
      scheduledDurationSamples: a.scheduledDurationCount,
      avgActualDurationMinutes: Math.round(avgActualDurationMinutes * 10) / 10,
      reliabilityScore,
      lowSample,
    });
  }

  cleaners.sort((x, y) => y.reliabilityScore - x.reliabilityScore);

  const fleetTrend7d: FleetDayTrend[] = [...trendBuckets.entries()]
    .sort(([da], [db]) => da.localeCompare(db))
    .map(([day, v]) => ({
      day,
      onTimePct: v.eligible > 0 ? Math.round((100 * v.onTime) / v.eligible) : null,
      completedJobs: v.completed,
    }));

  return { cleaners, fleetTrend7d };
}
