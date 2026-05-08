import { centsToZar } from "@/lib/admin/adminBookingsListDerived";
import {
  calculateCleanerPayoutFromBookingRow,
  resolveTotalPaidCents,
} from "@/lib/payout/calculateCleanerPayout";

/** Minimal booking fields for admin payout summary (list card + details). */
export type AdminBookingCleanerPayoutInput = {
  payout_type?: string | null;
  is_team_job?: boolean | null;
  /** Headcount at assignment; used with `team_per_cleaner_fixed` to show total team payout. */
  team_member_count_snapshot?: number | null;
  display_earnings_cents?: number | null;
  cleaner_earnings_total_cents?: number | null;
  cleaner_payout_cents?: number | null;
  cleaner_bonus_cents?: number | null;
  /** Paid / recorded total (ZAR major units). */
  total_paid_zar?: number | null;
  amount_paid_cents?: number | null;
  /** Quoted visit total when not yet settled to paid columns. */
  total_price?: number | null;
  base_amount_cents?: number | null;
  service_fee_cents?: number | null;
  service?: string | null;
  booking_snapshot?: unknown;
  /** When projecting solo payout, pass `cleaners.joined_at` + booking appointment for canonical tenure. */
  cleaner_joined_at?: string | null;
  booking_date?: string | null;
  booking_time?: string | null;
};

export type AdminBookingCleanerPayoutDisplay = {
  payoutLabel: string;
  payoutZar: number | null;
  bonusZar: number;
  pending: boolean;
  teamPool: boolean;
  /**
   * Solo: `cleaner_payout_cents` was still null, but we derived amounts from quoted/paid totals
   * using the same hybrid rules as persistence (tenure unknown → new-cleaner rate).
   */
  projected?: boolean;
  /** Set with `projected` — company line from the same model. */
  projectedCompanyZar?: number | null;
};

function adminQuotedOrPaidCents(b: AdminBookingCleanerPayoutInput): number {
  const paid = resolveTotalPaidCents(b.total_paid_zar, b.amount_paid_cents);
  if (paid > 0) return paid;
  const tp = Number(b.total_price);
  if (Number.isFinite(tp) && tp > 0) return Math.round(tp * 100);
  return 0;
}

function tryProjectSoloAdminPayout(b: AdminBookingCleanerPayoutInput): AdminBookingCleanerPayoutDisplay | null {
  const previewCents = adminQuotedOrPaidCents(b);
  if (previewCents <= 0) return null;
  const p = calculateCleanerPayoutFromBookingRow({
    totalPaidZar: null,
    amountPaidCents: previewCents,
    baseAmountCents: b.base_amount_cents,
    serviceFeeCents: b.service_fee_cents,
    serviceLabel: b.service ?? null,
    bookingSnapshot: b.booking_snapshot ?? null,
    cleanerJoinedAtIso: b.cleaner_joined_at ?? null,
    bookingDate: b.booking_date ?? undefined,
    bookingTime: b.booking_time ?? undefined,
  });
  return {
    payoutLabel: "Cleaner payout",
    payoutZar: Math.round(p.payoutCents / 100),
    bonusZar: Math.round(p.bonusCents / 100),
    pending: false,
    teamPool: false,
    projected: true,
    projectedCompanyZar: Math.round(p.companyRevenueCents / 100),
  };
}

/**
 * Team jobs surface cleaner-facing totals via `display_earnings_cents` (and ledger fallback);
 * legacy `cleaner_payout_cents` is often 0. Solo jobs use `cleaner_payout_cents` / `cleaner_bonus_cents`.
 */
export function computeAdminBookingCleanerPayoutDisplay(
  booking: AdminBookingCleanerPayoutInput,
): AdminBookingCleanerPayoutDisplay {
  const payoutType = String(booking.payout_type ?? "").trim().toLowerCase();
  const teamPerCleanerFixed = payoutType === "team_per_cleaner_fixed";
  const teamFixedLegacy = payoutType === "team_fixed";
  const teamJob = booking.is_team_job === true;
  const useTeamAggregate = teamJob && (teamPerCleanerFixed || teamFixedLegacy || !payoutType);

  const displayRaw = booking.display_earnings_cents;
  const displayCents =
    displayRaw != null && Number.isFinite(Number(displayRaw)) ? Math.max(0, Math.round(Number(displayRaw))) : null;

  const ledgerRaw = booking.cleaner_earnings_total_cents;
  const ledgerCents =
    ledgerRaw != null && Number.isFinite(Number(ledgerRaw)) ? Math.max(0, Math.round(Number(ledgerRaw))) : null;

  const snapRaw = Number(booking.team_member_count_snapshot);
  const teamHeadcount = Number.isFinite(snapRaw) && snapRaw > 0 ? Math.floor(snapRaw) : 1;

  if (useTeamAggregate) {
    let totalTeamCleanerPayoutCents: number | null = null;
    if (ledgerCents != null && ledgerCents > 0) {
      totalTeamCleanerPayoutCents = ledgerCents;
    } else if (teamPerCleanerFixed && displayCents != null) {
      totalTeamCleanerPayoutCents = displayCents * teamHeadcount;
    } else if (displayCents != null) {
      totalTeamCleanerPayoutCents = teamFixedLegacy ? displayCents : displayCents * teamHeadcount;
    }

    if (totalTeamCleanerPayoutCents != null) {
      return {
        payoutLabel: teamPerCleanerFixed ? "Team cleaner payout (total)" : "Team cleaner pool",
        payoutZar: centsToZar(totalTeamCleanerPayoutCents),
        bonusZar: 0,
        pending: false,
        teamPool: true,
      };
    }
    return {
      payoutLabel: teamPerCleanerFixed ? "Team cleaner payout (total)" : "Team cleaner pool",
      payoutZar: null,
      bonusZar: 0,
      pending: true,
      teamPool: true,
    };
  }

  const payoutZar = centsToZar(booking.cleaner_payout_cents);
  const bonusZar = centsToZar(booking.cleaner_bonus_cents) ?? 0;
  if (payoutZar != null) {
    return {
      payoutLabel: "Cleaner payout",
      payoutZar,
      bonusZar,
      pending: false,
      teamPool: false,
    };
  }
  const projected = tryProjectSoloAdminPayout(booking);
  if (projected) return projected;
  return {
    payoutLabel: "Cleaner payout",
    payoutZar: null,
    bonusZar,
    pending: true,
    teamPool: false,
  };
}
