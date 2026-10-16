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
 * October participant summaries/rosters identify adjusted booking-wide costs.
 * The equal-share multiple fallback is retained for older/incomplete projections;
 * unrelated solo aggregates do not override the display lock.
 */
export type BookingWideCleanerEarningsInput = {
  is_team_job?: boolean | null;
  date?: string | null;
  cleaner_earnings_total_cents?: unknown;
  display_earnings_cents?: unknown;
  internal_earnings_cents?: unknown;
  earnings_policy?: string | null;
  cleaner_payout_cents?: unknown;
  cleaner_bonus_cents?: unknown;
  earnings_summary?: unknown;
  roster_cleaner_count?: number;
  booking_cleaners?: Array<{ cleaner_id?: string | null }> | null;
};

export function resolveBookingWideCleanerEarningsCents(row: BookingWideCleanerEarningsInput): {
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

  // October forward: unequal participant adjustments are not exact multiples of
  // a display basis. Actual roster evidence (or a persisted participant summary
  // when the caller has no roster projection) identifies a booking-wide amount.
  if ((row.date != null && row.date >= "2026-10-01")
    || (row.date === undefined && row.roster_cleaner_count != null)) {
    const summary = parseBookingEarningsSummary(row.earnings_summary);
    const rosterCount = row.roster_cleaner_count ?? (row.booking_cleaners == null ? null
      : new Set(row.booking_cleaners.map(r => String(r.cleaner_id ?? "").trim()).filter(Boolean)).size);
    const paired = rosterCount == null ? (summary?.cleaner_count ?? 0) > 1 : rosterCount > 1;
    const directPayout = optionalCentsFromDb(row.cleaner_payout_cents);
    if (row.date != null && row.date >= "2026-10-01" && row.earnings_policy === "legacy_july"
      && rosterCount != null && rosterCount <= 1
      && (directPayout != null || optionalCentsFromDb(row.internal_earnings_cents) != null)) {
      return {cleaner_cost_cents:directPayout == null ? optionalCentsFromDb(row.internal_earnings_cents)!
        : Math.max(0,directPayout+(optionalCentsFromDb(row.cleaner_bonus_cents)??0)),
        incomplete_team_earnings:false,included_in_trusted_totals:true};
    }
    const obligation = summary?.total_cleaner_earnings_cents
      ?? optionalCentsFromDb(row.internal_earnings_cents) ?? total;
    const solo = summary?.cleaner_count === 1 ? summary.per_cleaner_earnings[0] : null;
    if (!paired && solo && display != null && solo.base_earning_cents === display
      && solo.total_cents === Math.max(0,display+solo.bonus_cents-solo.deduction_cents)) {
      return {cleaner_cost_cents:solo.total_cents,incomplete_team_earnings:false,included_in_trusted_totals:true};
    }
    if (paired && obligation != null && Number.isSafeInteger(obligation) && obligation >= 0) {
      return { cleaner_cost_cents: obligation, incomplete_team_earnings: false, included_in_trusted_totals: true };
    }
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
    date?: string | null;
    earnings_policy?: string | null;
    cleaner_id?: string | null;
    payout_owner_cleaner_id?: string | null;
    cleaner_payout_cents?: unknown;
    cleaner_bonus_cents?: unknown;
    internal_earnings_cents?: unknown;
    roster_cleaner_count?: number;
    booking_cleaners?: Array<{ cleaner_id?: string | null }> | null;
    booking_roster_member_payouts?: Array<{cleaner_id:string;payout_cents:number;bonus_cents?:number}> | null;
    viewer_payout_cents?: unknown;
    earnings_summary?: unknown;
    cleaner_earnings_total_cents?: unknown;
    payout_frozen_cents?: unknown;
    display_earnings_cents?: unknown;
    is_team_job?: boolean | null;
  },
  cleanerId: string,
): number {
  const viewerPayout = optionalCentsFromDb(booking.viewer_payout_cents);
  if (viewerPayout !== null) return Math.max(0, Math.round(viewerPayout));

  const summary = parseBookingEarningsSummary(booking.earnings_summary);
  const facing = resolveCleanerFacingEarnings(summary, cleanerId);

  /*
   * Team bookings can have a generic booking-level display lock (for example
   * the standard member amount) while the canonical earnings summary carries
   * viewer-specific amounts such as a lead uplift. In that case the summary
   * is the authoritative per-cleaner value.
   *
   * Solo bookings keep the historical policy-lock precedence so stale summary
   * JSON cannot override an explicitly frozen/displayed amount.
   */
  if (booking.is_team_job === true && facing) {
    return Math.max(0, Math.round(facing.total_cents));
  }

  const frozen = optionalCentsFromDb(booking.payout_frozen_cents);
  const basis = optionalCentsFromDb(booking.display_earnings_cents);
  if (booking.date != null && booking.date >= "2026-10-01" && facing
    && !(frozen != null && frozen > 0) && basis === facing.job_earning_cents
    && facing.total_cents === Math.max(0,basis+facing.bonus_cents-facing.deduction_cents)) {
    return facing.total_cents;
  }

  const direct = optionalCentsFromDb(booking.cleaner_payout_cents);
  if (booking.date != null && booking.date >= "2026-10-01" && booking.earnings_policy === "legacy_july"
    && cleanerId === (booking.payout_owner_cleaner_id ?? booking.cleaner_id)
    && !summary && direct != null && !(frozen != null && frozen > 0)) {
    return Math.max(0,direct+(optionalCentsFromDb(booking.cleaner_bonus_cents)??0));
  }
  const participantCount=booking.roster_cleaner_count ?? (booking.booking_cleaners == null ? null
    : new Set(booking.booking_cleaners.map(r=>r.cleaner_id).filter(Boolean)).size);
  const obligation=optionalCentsFromDb(booking.internal_earnings_cents);
  if (booking.date != null && booking.date >= "2026-10-01" && booking.earnings_policy === "legacy_july"
    && cleanerId === (booking.payout_owner_cleaner_id ?? booking.cleaner_id) && !summary
    && direct == null && participantCount != null && participantCount <= 1 && obligation != null
    && !(frozen != null && frozen > 0)) return obligation;
  // When cash readiness suppresses the direct header and the summary is absent,
  // the current fixed-policy lead's earned share is the actual booking obligation
  // less the complete set of non-lead earned-basis rows. Never use a partial rail.
  if (booking.date != null && booking.date >= "2026-10-01" && booking.earnings_policy === "legacy_july"
    && booking.is_team_job !== true && cleanerId === (booking.payout_owner_cleaner_id ?? booking.cleaner_id)
    && !summary && direct == null && !(frozen != null && frozen > 0) && obligation != null) {
    const ids=[...new Set((booking.booking_cleaners??[]).map(r=>String(r.cleaner_id??"").trim()).filter(Boolean))];
    const peers=ids.filter(id=>id!==cleanerId);
    const rows=booking.booking_roster_member_payouts;
    if(ids.includes(cleanerId)&&peers.length>0&&rows&&rows.length===peers.length
      &&new Set(rows.map(r=>r.cleaner_id)).size===peers.length&&rows.every(r=>peers.includes(r.cleaner_id))) {
      const total=rows.reduce((sum,r)=>sum+Number(r.payout_cents)+Number(r.bonus_cents??0),0);
      if(Number.isSafeInteger(total)&&total>=0&&total<=obligation) return obligation-total;
    }
  }
  const locked = resolveCleanerEarningsCents(booking);
  if (locked !== null) return Math.max(0, Math.round(locked));

  if (facing) return Math.max(0, Math.round(facing.total_cents));
  return 0;
}

/** Job detail uses the shared net amount for current visits, preserving old detail semantics. */
export function resolveCleanerJobDetailEarningsCents(
  booking: Parameters<typeof resolveCleanerDashboardEarningsCents>[0],
  cleanerId: string,
  legacyFallback: number | null,
): number | null {
  return booking.date != null && booking.date >= "2026-10-01"
    ? resolveCleanerDashboardEarningsCents(booking, cleanerId)
    : legacyFallback;
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
