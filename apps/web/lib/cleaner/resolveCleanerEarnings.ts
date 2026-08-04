import { optionalCentsFromDb } from "@/lib/cleaner/cleanerJobDisplayEarningsResolve";
import {
  parseBookingEarningsSummary,
  resolveCleanerFacingEarnings,
} from "@/lib/payout/bookingEarningsSummary";

function isLegacyJulyPolicy(row: {
  earnings_policy?: unknown;
  earnings_model_version?: unknown;
}): boolean {
  const policy = String(row.earnings_policy ?? "").trim().toLowerCase();
  const model = String(row.earnings_model_version ?? "").trim().toLowerCase();
  return policy === "legacy_july" || model.startsWith("legacy_july");
}

/**
 * Single cleaner-facing earnings amount for jobs and offers.
 *
 * Legacy July bookings are policy-locked: positive frozen/display values are
 * authoritative and must win over stale line-ledger totals from Current V1.
 * Other policies keep the normal line-ledger -> frozen -> display precedence.
 */
export function resolveCleanerEarningsCents(row: {
  earnings_policy?: unknown;
  earnings_model_version?: unknown;
  cleaner_earnings_total_cents?: unknown;
  payout_frozen_cents?: unknown;
  display_earnings_cents?: unknown;
}): number | null {
  const frozen = optionalCentsFromDb(row.payout_frozen_cents);
  const display = optionalCentsFromDb(row.display_earnings_cents);

  if (isLegacyJulyPolicy(row)) {
    if (frozen !== null && frozen > 0) return frozen;
    if (display !== null) return display;
  }

  const lineTotal = optionalCentsFromDb(row.cleaner_earnings_total_cents);
  if (lineTotal !== null && lineTotal > 0) return lineTotal;

  if (frozen !== null && frozen > 0) return frozen;
  if (frozen === 0 && display !== null && display > 0) return display;
  if (frozen !== null) return frozen;
  if (display !== null) return display;
  return null;
}

/**
 * Per-cleaner amount shown on the cleaner dashboard earnings screen and matched in office payouts.
 * Legacy July uses the policy lock before any potentially stale earnings summary.
 */
export function resolveCleanerDashboardEarningsCents(
  booking: {
    earnings_policy?: unknown;
    earnings_model_version?: unknown;
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

  if (isLegacyJulyPolicy(booking)) {
    const locked = resolveCleanerEarningsCents(booking);
    return Math.max(0, Math.round(locked ?? 0));
  }

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
