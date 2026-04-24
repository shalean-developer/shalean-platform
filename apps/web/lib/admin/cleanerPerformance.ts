import { bookingScheduledStartUtcMs } from "@/lib/admin/opsSnapshot";

export type BookingPerfInput = {
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
  avgJobDurationMinutes: number;
  reliabilityScore: number;
  lowSample: boolean;
};

export type FleetDayTrend = {
  day: string;
  onTimePct: number;
  completedJobs: number;
};

function parseTs(iso: string | null | undefined): number | null {
  if (!iso || !String(iso).trim()) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

function st(s: string | null | undefined): string {
  return String(s ?? "").toLowerCase().trim();
}

const TERMINAL = new Set(["completed", "cancelled", "failed"]);

type Acc = {
  jobsCompleted: number;
  terminal: number;
  completedTerminal: number;
  punctualityJobs: number;
  onTimeJobs: number;
  /** Sum of max(0, late minutes) across punctuality jobs (on-time contributes 0). */
  sumPositiveLateMinutes: number;
  /** Among late jobs only — for lateness penalty in score. */
  sumLateAmongLate: number;
  lateCount: number;
  durationCount: number;
  sumDurationMinutes: number;
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
    durationCount: 0,
    sumDurationMinutes: 0,
  };
}

/**
 * Reliability score (0–100):
 * (on_time_rate × 0.4) + (completion_rate × 0.4) + (lateness_penalty × 0.2),
 * lateness_penalty = clamp(0,1, 1 − min(avgLateMinutes/45, 1)) using avg lateness among late jobs only.
 */
export function aggregateCleanerPerformance(
  bookings: BookingPerfInput[],
  cleanerNames: Map<string, string>,
): { cleaners: CleanerPerfRow[]; fleetTrend7d: FleetDayTrend[] } {
  const acc = new Map<string, Acc>();

  const now = Date.now();
  const dayMs = 86_400_000;
  const trendBuckets = new Map<string, { onTime: number; eligible: number; completed: number }>();

  for (let i = 0; i < 7; i++) {
    const d = new Date(now - (6 - i) * dayMs);
    trendBuckets.set(d.toISOString().slice(0, 10), { onTime: 0, eligible: 0, completed: 0 });
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

    if (status === "completed") {
      a.jobsCompleted++;
      const cAt = parseTs(b.completed_at);
      if (cAt != null) {
        const dayKey = new Date(cAt).toISOString().slice(0, 10);
        const tb = trendBuckets.get(dayKey);
        if (tb) tb.completed++;
      }
    }

    if (TERMINAL.has(status)) {
      a.terminal++;
      if (status === "completed") a.completedTerminal++;
    }

    const sched = bookingScheduledStartUtcMs(b.date, b.time);
    const started = parseTs(b.started_at);
    if (sched != null && started != null) {
      a.punctualityJobs++;
      const lateMin = Math.max(0, (started - sched) / 60_000);
      a.sumPositiveLateMinutes += lateMin;
      if (started <= sched) {
        a.onTimeJobs++;
      } else {
        a.sumLateAmongLate += lateMin;
        a.lateCount++;
      }

      if (status === "completed") {
        const cAt = parseTs(b.completed_at);
        if (cAt != null) {
          const dayKey = new Date(cAt).toISOString().slice(0, 10);
          const tb = trendBuckets.get(dayKey);
          if (tb) {
            tb.eligible++;
            if (started <= sched) tb.onTime++;
          }
        }
      }
    }

    if (status === "completed" && started != null) {
      const completedAt = parseTs(b.completed_at);
      if (completedAt != null && completedAt > started) {
        a.durationCount++;
        a.sumDurationMinutes += (completedAt - started) / 60_000;
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

    const avgJobDurationMinutes = a.durationCount > 0 ? a.sumDurationMinutes / a.durationCount : 0;

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
      reliabilityScore,
      lowSample,
    });
  }

  cleaners.sort((x, y) => y.reliabilityScore - x.reliabilityScore);

  const fleetTrend7d: FleetDayTrend[] = [...trendBuckets.entries()]
    .sort(([da], [db]) => da.localeCompare(db))
    .map(([day, v]) => ({
      day,
      onTimePct: v.eligible > 0 ? Math.round((100 * v.onTime) / v.eligible) : 0,
      completedJobs: v.completed,
    }));

  return { cleaners, fleetTrend7d };
}
