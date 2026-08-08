import { optionalCentsFromDb } from "@/lib/cleaner/cleanerJobDisplayEarningsResolve";
import {
  parseBookingEarningsSummary,
  resolveCleanerFacingEarnings,
} from "@/lib/payout/bookingEarningsSummary";

/**
 * Single policy-controlled cleaner earnings amount.
 *
 * A positive settlement freeze is final. Otherwise the booking's display
 * earning is the policy lock written by the earnings-policy trigger. Stale
 * line-ledger totals are only a fallback and must not override that lock.
 */
export function resolveCleanerEarningsCents(row: {
  cleaner_earnings_total_cents?: unknown;
  payout_frozen_cents?: unknown;
  display_earnings_cents?: unknown;
}): number | null {
  const frozen = optionalCentsFromDb(row.payout_frozen_cents);
  const display = optionalCentsFromDb(row.display_earnings_cents);
  const lineTotal = optionalCentsFromDb(row.cleaner_earnings_total_cents);

  if (frozen !== null && frozen > 0) return frozen;
  if (display !== null && display > 0) return display;
  if (lineTotal !== null && lineTotal > 0) return lineTotal;
  if (frozen !== null) return frozen;
  if (display !== null) return display;
  if (lineTotal !== null) return lineTotal;
  return null;
}

/**
 * Canonical booking-wide cleaner cost used by finance/reporting surfaces.
 *
 * Explicit team jobs must carry a positive booking-wide total. Non-team jobs
 * normally use the per-cleaner display lock, but paired/multi-cleaner Standard
 * bookings can remain operationally non-team while storing a booking-wide total.
 * In that case an exact multiple of the display lock is treated as the trusted
 * booking-wide cleaner cost. Unrelated/stale totals do not override the display lock.
 */
export function resolveBookingWideCleanerEarningsCents(row: {
  is_team_job?: boolean | null;
  cleaner_earnings_total_cents?: unknown;
  display_earnings_cents?: unknown;
}): {
  cleaner_cost_cents: number | null;
  incomplete_team_earnings: boolean;
  included_in_trusted_totals: boolean;
} {
  const total = optionalCentsFromDb(row.cleaner_earnings_total_cents);
  const display = optionalCentsFromDb(row.display_earnings_cents);

  if (row.is_team_job === true) {
    if (total === null || total <= 0) {
      return {
        cleaner_cost_cents: null,
        incomplete_team_earnings: true,
        included_in_trusted_totals: false,
      };
    }
    return {
      cleaner_cost_cents: total,
      incomplete_team_earnings: false,
      included_in_trusted_totals: true,
    };
  }

  const looksLikeMultiCleanerTotal =
    total !== null && display !== null && display > 0 && total > display && total % display === 0;

  return {
    cleaner_cost_cents: looksLikeMultiCleanerTotal ? total : (display ?? total ?? 0),
    incomplete_team_earnings: false,
    included_in_trusted_totals: true,
  };
}

/**
 * Per-cleaner amount shown on the cleaner dashboard and Office payout report.
 * Team-member payout rows remain the highest-priority per-cleaner source.
 * For individual jobs, the booking policy lock wins over stale earnings JSON.
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

  const locked = resolveCleanerEarningsCents(booking);
  if (locked !== null) return Math.max(0, Math.round(locked));

  const facing = resolveCleanerFacingEarnings(
    parseBookingEarningsSummary(booking.earnings_summary),
    cleanerId,
  );
  if (facing) return Math.max(0, Math.round(facing.total_cents));
  return 0;
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
