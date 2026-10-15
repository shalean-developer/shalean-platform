import { isClosedMonthlyPayoutBatchPeriod } from "@/lib/payout/monthBounds";

/** Owner-authorized forward processing boundary, separate from the July model epoch. */
export const PAYOUT_PROCESSING_START_YMD = "2026-10-01";
export const HISTORICAL_PAYOUT_DEFERRED_MESSAGE =
  "Pre-October cleaner earnings are deferred for historical review and cannot enter current payout processing.";

/** Canonical calendar date for stored legacy text, without guessing invalid dates. */
export function normalizePayoutVisitDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}

export function isCurrentPayoutVisitDate(value: unknown): boolean {
  const date = normalizePayoutVisitDate(value);
  return date !== null && date >= PAYOUT_PROCESSING_START_YMD;
}

export function isProcessableClosedPayoutPeriod(start: string, end: string, now: Date = new Date()): boolean {
  return isCurrentPayoutVisitDate(start) && isClosedMonthlyPayoutBatchPeriod(start, end, now);
}

/** Forward payouts use the visit's calendar month, including late completion. */
export function currentPayoutBatchDayYmd(booking: { date?: unknown }): string | null {
  return isCurrentPayoutVisitDate(booking.date) ? normalizePayoutVisitDate(booking.date) : null;
}

export function isPayoutVisitInPeriod(date: unknown, start: string, end: string): boolean {
  const visit = normalizePayoutVisitDate(date);
  return visit !== null && isCurrentPayoutVisitDate(visit) && visit >= start && visit <= end;
}
