import { parseLockedBookingFromUnknown, type LockedBooking } from "@/lib/booking/lockedBooking";
import { metrics } from "@/lib/metrics/counters";
import { selectLegacyLockedBookingDurationMinutes } from "@/lib/pricing/legacyDurationSelection";

export const BOOKING_DURATION_FALLBACK_MINUTES = 120;
export const MIN_REASONABLE_BOOKING_DURATION_MINUTES = 30;
export const MAX_REASONABLE_BOOKING_DURATION_MINUTES = 12 * 60;
export const FUTURE_MAX_CLEANER_DAY_MINUTES = 8 * 60;

export type BookingDurationMinutesDiagnosticCode =
  | "missing_duration_minutes"
  | "fallback_to_120"
  | "duration_mismatch_vs_locked_quote"
  | "unrealistic_duration_minutes"
  | "future_8h_day_exceeded";

export type BookingDurationMinutesDiagnostic = {
  code: BookingDurationMinutesDiagnosticCode;
  severity: "info" | "warn";
  bookingId?: string;
  source?: string;
  durationMinutes?: number | null;
  lockedDurationMinutes?: number | null;
  fallbackMinutes?: number;
};

export type CleanerDailyWorkloadRisk = {
  cleanerId: string;
  dateYmd: string;
  bookingIds: string[];
  totalDurationMinutes: number;
  maxPolicyMinutes: number;
};

function finiteNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function validPersistedDurationMinutes(v: unknown): number | null {
  const n = finiteNumber(v);
  if (n == null || n < MIN_REASONABLE_BOOKING_DURATION_MINUTES) return null;
  return Math.round(n);
}

export function selectLockedBookingDurationMinutesForPersistence(locked: LockedBooking | null | undefined): number | null {
  if (!locked) return null;
  return selectLegacyLockedBookingDurationMinutes(locked);
}

export function lockedDurationMinutesPatch(
  locked: LockedBooking | null | undefined,
): { duration_minutes: number } | Record<string, never> {
  const durationMinutes = selectLockedBookingDurationMinutesForPersistence(locked);
  return durationMinutes != null ? { duration_minutes: durationMinutes } : {};
}

export function lockedDurationMinutesFromBookingSnapshot(
  snapshot: { locked?: unknown } | Record<string, unknown> | null | undefined,
): number | null {
  const locked = parseLockedBookingFromUnknown(snapshot?.locked ?? null);
  return selectLockedBookingDurationMinutesForPersistence(locked);
}

export function buildBookingDurationMinutesDiagnostics(input: {
  bookingId?: string | null;
  source?: string | null;
  durationMinutes?: number | null;
  locked?: LockedBooking | null;
  lockedDurationMinutes?: number | null;
  fallbackUsed?: boolean;
  fallbackMinutes?: number;
}): BookingDurationMinutesDiagnostic[] {
  const out: BookingDurationMinutesDiagnostic[] = [];
  const source = input.source?.trim() || undefined;
  const bookingId = input.bookingId?.trim() || undefined;
  const fallbackMinutes = Math.round(input.fallbackMinutes ?? BOOKING_DURATION_FALLBACK_MINUTES);
  const rawDuration = finiteNumber(input.durationMinutes);
  const validDuration = validPersistedDurationMinutes(input.durationMinutes);
  const lockedDuration =
    input.lockedDurationMinutes ??
    selectLockedBookingDurationMinutesForPersistence(input.locked ?? null);

  const base = {
    bookingId,
    source,
    durationMinutes: rawDuration,
    lockedDurationMinutes: lockedDuration,
  };

  if (rawDuration == null) {
    out.push({ code: "missing_duration_minutes", severity: "warn", ...base });
  }

  if (input.fallbackUsed === true || validDuration == null) {
    out.push({
      code: "fallback_to_120",
      severity: "warn",
      ...base,
      fallbackMinutes,
    });
  }

  if (
    rawDuration != null &&
    (rawDuration < MIN_REASONABLE_BOOKING_DURATION_MINUTES ||
      rawDuration > MAX_REASONABLE_BOOKING_DURATION_MINUTES)
  ) {
    out.push({ code: "unrealistic_duration_minutes", severity: "warn", ...base });
  }

  if (validDuration != null && lockedDuration != null && validDuration !== lockedDuration) {
    out.push({
      code: "duration_mismatch_vs_locked_quote",
      severity: "warn",
      ...base,
      durationMinutes: validDuration,
    });
  }

  if (validDuration != null && validDuration > FUTURE_MAX_CLEANER_DAY_MINUTES) {
    out.push({
      code: "future_8h_day_exceeded",
      severity: "info",
      ...base,
      durationMinutes: validDuration,
    });
  }

  return out;
}

export function reportBookingDurationMinutesDiagnostics(
  diagnostics: readonly BookingDurationMinutesDiagnostic[],
): void {
  for (const d of diagnostics) {
    metrics.increment("booking.duration_minutes_integrity", {
      code: d.code,
      severity: d.severity,
      bookingId: d.bookingId,
      source: d.source,
      durationMinutes: d.durationMinutes,
      lockedDurationMinutes: d.lockedDurationMinutes,
      fallbackMinutes: d.fallbackMinutes,
    });
  }
}

export function reportDurationFallbackTo120(input: {
  bookingId?: string | null;
  source: string;
  durationMinutes?: number | null;
}): void {
  reportBookingDurationMinutesDiagnostics(
    buildBookingDurationMinutesDiagnostics({
      bookingId: input.bookingId,
      source: input.source,
      durationMinutes: input.durationMinutes,
      fallbackUsed: true,
      fallbackMinutes: BOOKING_DURATION_FALLBACK_MINUTES,
    }),
  );
}

export function findBookingsMissingDurationMinutes<T extends { id?: string; duration_minutes?: number | null }>(
  rows: readonly T[],
): T[] {
  return rows.filter((row) => validPersistedDurationMinutes(row.duration_minutes) == null);
}

export function findBookingsWithUnrealisticDurationMinutes<
  T extends { id?: string; duration_minutes?: number | null },
>(rows: readonly T[]): T[] {
  return rows.filter((row) => {
    const d = finiteNumber(row.duration_minutes);
    return d != null && (d < MIN_REASONABLE_BOOKING_DURATION_MINUTES || d > MAX_REASONABLE_BOOKING_DURATION_MINUTES);
  });
}

export function findFutureDailyWorkloadPolicyExcess(
  rows: readonly {
    id?: string | null;
    cleaner_id?: string | null;
    date?: string | null;
    booking_date?: string | null;
    duration_minutes?: number | null;
  }[],
  maxPolicyMinutes = FUTURE_MAX_CLEANER_DAY_MINUTES,
): CleanerDailyWorkloadRisk[] {
  const byCleanerDay = new Map<string, CleanerDailyWorkloadRisk>();
  for (const row of rows) {
    const cleanerId = typeof row.cleaner_id === "string" ? row.cleaner_id.trim() : "";
    const dateYmd = typeof row.date === "string" && row.date.trim() ? row.date.trim() : row.booking_date?.trim() ?? "";
    const durationMinutes = validPersistedDurationMinutes(row.duration_minutes);
    if (!cleanerId || !/^\d{4}-\d{2}-\d{2}$/.test(dateYmd) || durationMinutes == null) continue;
    const key = `${cleanerId}:${dateYmd}`;
    const existing =
      byCleanerDay.get(key) ??
      ({
        cleanerId,
        dateYmd,
        bookingIds: [],
        totalDurationMinutes: 0,
        maxPolicyMinutes,
      } satisfies CleanerDailyWorkloadRisk);
    if (row.id) existing.bookingIds.push(String(row.id));
    existing.totalDurationMinutes += durationMinutes;
    byCleanerDay.set(key, existing);
  }
  return [...byCleanerDay.values()].filter((row) => row.totalDurationMinutes > maxPolicyMinutes);
}
