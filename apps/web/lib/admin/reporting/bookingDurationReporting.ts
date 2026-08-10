import {
  resolvePersistedBookingDurationMinutes,
  type BookingDurationRowLike,
} from "@/lib/booking/quote/bookingQuotePersistence";

export type BookingDurationReportingRow = BookingDurationRowLike & {
  id?: string | null;
  cleaner_id?: string | null;
  date?: string | null;
  status?: string | null;
};

/** Persisted quote duration for reporting aggregates — no silent defaults. */
export function resolveReportingDurationMinutes(row: BookingDurationReportingRow): number | null {
  return resolvePersistedBookingDurationMinutes(row);
}

export function sumScheduledMinutes(rows: readonly BookingDurationReportingRow[]): number {
  let sum = 0;
  for (const row of rows) {
    const minutes = resolveReportingDurationMinutes(row);
    if (minutes != null && minutes > 0) sum += minutes;
  }
  return sum;
}

export function avgScheduledMinutes(rows: readonly BookingDurationReportingRow[]): number | null {
  let sum = 0;
  let count = 0;
  for (const row of rows) {
    const minutes = resolveReportingDurationMinutes(row);
    if (minutes != null && minutes > 0) {
      sum += minutes;
      count++;
    }
  }
  return count > 0 ? sum / count : null;
}

export type DurationCoverageSummary = {
  totalBookings: number;
  coveredBookings: number;
  missingBookings: number;
  coveragePct: number;
};

/** Coverage guard for planning/productivity metrics that must not look healthy on incomplete data. */
export function summarizeDurationCoverage(
  rows: readonly BookingDurationReportingRow[],
): DurationCoverageSummary {
  const coveredBookings = rows.reduce(
    (count, row) => count + (resolveReportingDurationMinutes(row) != null ? 1 : 0),
    0,
  );
  const totalBookings = rows.length;
  return {
    totalBookings,
    coveredBookings,
    missingBookings: totalBookings - coveredBookings,
    coveragePct: totalBookings > 0 ? (coveredBookings / totalBookings) * 100 : 100,
  };
}

export type FleetHourUtilizationInput = {
  bookings: readonly BookingDurationReportingRow[];
  activeCleanerCount: number;
  windowDays: number;
  policyMinutesPerCleanerDay: number;
  /** Return a neutral score when canonical-duration coverage is lower than this threshold. */
  minimumCoveragePct?: number;
};

/** Scheduled minutes vs fleet capacity (cleaners × days × policy hours per day). */
export function computeFleetHourUtilizationPct(input: FleetHourUtilizationInput): number {
  const { bookings, activeCleanerCount, windowDays, policyMinutesPerCleanerDay } = input;
  if (activeCleanerCount <= 0 || windowDays <= 0 || policyMinutesPerCleanerDay <= 0) return 50;

  const coverage = summarizeDurationCoverage(bookings);
  const minimumCoveragePct = input.minimumCoveragePct ?? 95;
  if (coverage.coveragePct < minimumCoveragePct) return 50;

  const scheduledMinutes = sumScheduledMinutes(bookings);
  const capacityMinutes = activeCleanerCount * windowDays * policyMinutesPerCleanerDay;
  if (capacityMinutes <= 0) return 50;

  return Math.min(100, (scheduledMinutes / capacityMinutes) * 100);
}
