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

export type FleetHourUtilizationInput = {
  bookings: readonly BookingDurationReportingRow[];
  activeCleanerCount: number;
  windowDays: number;
  policyMinutesPerCleanerDay: number;
};

/** Scheduled minutes vs fleet capacity (cleaners × days × policy hours per day). */
export function computeFleetHourUtilizationPct(input: FleetHourUtilizationInput): number {
  const { bookings, activeCleanerCount, windowDays, policyMinutesPerCleanerDay } = input;
  if (activeCleanerCount <= 0 || windowDays <= 0 || policyMinutesPerCleanerDay <= 0) return 50;

  const scheduledMinutes = sumScheduledMinutes(bookings);
  const capacityMinutes = activeCleanerCount * windowDays * policyMinutesPerCleanerDay;
  if (capacityMinutes <= 0) return 50;

  return Math.min(100, (scheduledMinutes / capacityMinutes) * 100);
}
