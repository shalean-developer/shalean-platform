import { isClosedMonthlyPayoutBatchPeriod } from "@/lib/payout/monthBounds";

/** Owner-authorized forward processing boundary, separate from the July model epoch. */
export const PAYOUT_PROCESSING_START_YMD = "2026-10-01";
export const HISTORICAL_PAYOUT_DEFERRED_MESSAGE =
  "Pre-October cleaner earnings are deferred for historical review and cannot enter current payout processing.";

/** Reject absent, malformed and impossible visit dates rather than guessing their period. */
export function isCurrentPayoutVisitDate(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && value >= PAYOUT_PROCESSING_START_YMD;
}

export function isProcessableClosedPayoutPeriod(start: string, end: string, now: Date = new Date()): boolean {
  return isCurrentPayoutVisitDate(start) && isClosedMonthlyPayoutBatchPeriod(start, end, now);
}
