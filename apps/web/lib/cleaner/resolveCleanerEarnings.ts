import { optionalCentsFromDb } from "@/lib/cleaner/cleanerJobDisplayEarningsResolve";

/**
 * Single cleaner-facing earnings amount for jobs and offers: line-ledger total when set,
 * else positive frozen (settlement lock) then display. `payout_frozen_cents = 0` does not
 * override a positive `display_earnings_cents` (legacy / inconsistent rows); 0/0 remains zero.
 */
export function resolveCleanerEarningsCents(row: {
  cleaner_earnings_total_cents?: unknown;
  payout_frozen_cents?: unknown;
  display_earnings_cents?: unknown;
}): number | null {
  const lineTotal = optionalCentsFromDb(row.cleaner_earnings_total_cents);
  if (lineTotal !== null && lineTotal > 0) return lineTotal;

  const frozen = optionalCentsFromDb(row.payout_frozen_cents);
  const display = optionalCentsFromDb(row.display_earnings_cents);
  if (frozen !== null && frozen > 0) return frozen;
  if (frozen === 0 && display !== null && display > 0) return display;
  if (frozen !== null) return frozen;
  if (display !== null) return display;
  return null;
}

/** Basis used when moving a booking to `payout_status = eligible` (cleaner cents only). */
export function resolveCleanerFrozenCentsForSettlement(row: {
  display_earnings_cents?: unknown;
  cleaner_payout_cents?: unknown;
}): number | null {
  const d = optionalCentsFromDb(row.display_earnings_cents);
  if (d !== null) return d;
  const c = optionalCentsFromDb(row.cleaner_payout_cents);
  if (c !== null) return c;
  return null;
}
