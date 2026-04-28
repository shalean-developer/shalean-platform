import { optionalCentsFromDb } from "@/lib/cleaner/cleanerJobDisplayEarningsResolve";

/**
 * Single cleaner-facing earnings amount for jobs and offers: frozen (when set) then stored display.
 * Returns null until amounts exist — no estimates or customer-total fallbacks.
 */
export function resolveCleanerEarningsCents(row: {
  payout_frozen_cents?: unknown;
  display_earnings_cents?: unknown;
}): number | null {
  const frozen = optionalCentsFromDb(row.payout_frozen_cents);
  if (frozen != null && frozen > 0) return frozen;
  const display = optionalCentsFromDb(row.display_earnings_cents);
  if (display != null && display > 0) return display;
  return null;
}

/** Basis used when moving a booking to `payout_status = eligible` (cleaner cents only). */
export function resolveCleanerFrozenCentsForSettlement(row: {
  display_earnings_cents?: unknown;
  cleaner_payout_cents?: unknown;
}): number | null {
  const d = optionalCentsFromDb(row.display_earnings_cents);
  if (d != null && d > 0) return d;
  const c = optionalCentsFromDb(row.cleaner_payout_cents);
  if (c != null && c > 0) return c;
  return null;
}
