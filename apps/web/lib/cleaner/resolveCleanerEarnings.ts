import { optionalCentsFromDb } from "@/lib/cleaner/cleanerJobDisplayEarningsResolve";
import {
  parseBookingEarningsSummary,
  resolveCleanerFacingEarnings,
} from "@/lib/payout/bookingEarningsSummary";

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

/**
 * Per-cleaner amount shown on the cleaner dashboard earnings screen and matched in office payouts.
 * Uses `earnings_summary` per-cleaner totals when present, else {@link resolveCleanerEarningsCents}.
 */
export function resolveCleanerDashboardEarningsCents(
  booking: {
    viewer_payout_cents?: unknown;
    earnings_summary?: unknown;
    cleaner_earnings_total_cents?: unknown;
    payout_frozen_cents?: unknown;
    display_earnings_cents?: unknown;
  },
  cleanerId: string,
): number {
  const viewerPayout = optionalCentsFromDb(booking.viewer_payout_cents);
  if (viewerPayout !== null) return Math.max(0, Math.round(viewerPayout));
  const facing = resolveCleanerFacingEarnings(
    parseBookingEarningsSummary(booking.earnings_summary),
    cleanerId,
  );
  if (facing) return Math.max(0, Math.round(facing.total_cents));
  const fallback = resolveCleanerEarningsCents(booking);
  return Math.max(0, Math.round(fallback ?? 0));
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
