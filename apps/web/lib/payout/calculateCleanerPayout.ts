import {
  bookingAppointmentIsoUtc,
  normalizeBookingServiceIdForPayout,
  resolveCanonicalCleanerPayout,
} from "@/lib/payout/canonicalCleanerPayout";

export {
  FIXED_SPECIAL_PAYOUT_CENTS,
  MAX_STANDARD_BASE_PAYOUT_CENTS as MAX_BASE_PAYOUT_CENTS,
  MIN_STANDARD_BASE_PAYOUT_CENTS as MIN_PAYOUT_CENTS,
} from "@/lib/payout/canonicalCleanerPayout";

export {
  isFixedPayoutSpecial,
  isFixedPayoutSpecialFromNormalizedId,
  normalizeBookingServiceIdForPayout,
} from "@/lib/payout/canonicalCleanerPayout";

export type CleanerPayoutResult = {
  payoutCents: number;
  bonusCents: number;
  companyRevenueCents: number;
  payoutType:
    | "percentage"
    | "fixed_special"
    | "team_pool"
    | "team_per_cleaner_fixed"
    | "team_fixed_with_leader"
    | "team_percentage_parity"
    | "paired_roster_pool_split";
  /** Decimal rate for percentage model; null for fixed specials. */
  payoutPercentage: number | null;
  /** Subtotal cleaner payout was computed from (excludes platform service fee). */
  payoutBaseCents: number;
  /** Platform fee added to company revenue only. */
  serviceFeeCents: number;
};

/**
 * Total paid for the job in **cents** (ZAR).
 */
export function resolveTotalPaidCents(totalPaidZar: number | null | undefined, amountPaidCents: number | null | undefined): number {
  const zar = Number(totalPaidZar);
  if (Number.isFinite(zar) && zar > 0) {
    return Math.max(0, Math.round(zar * 100));
  }
  const cents = Number(amountPaidCents);
  if (Number.isFinite(cents) && cents > 0) {
    return Math.max(0, Math.round(cents));
  }
  return 0;
}

function payoutBaseCentsFromPriceSnapshot(snapshot: unknown): number | null {
  if (snapshot == null || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const o = snapshot as { base_price?: unknown; total_price?: unknown };
  const base = Number(o.base_price);
  if (Number.isFinite(base) && base > 0) return Math.max(0, Math.floor(base));
  const total = Number(o.total_price);
  if (Number.isFinite(total) && total > 0) return Math.max(0, Math.floor(total));
  return null;
}

/**
 * Resolve payout base (cleaner share pool) and platform fee from stored booking columns.
 * Legacy rows: `base_amount_cents` null → entire amount paid is the payout base; fee treated as 0 for split.
 */
export function resolvePayoutBaseAndServiceFeeCents(params: {
  baseAmountCents: number | null | undefined;
  serviceFeeCents: number | null | undefined;
  totalPaidZar: number | null | undefined;
  amountPaidCents: number | null | undefined;
  /** Booking-v2 `price_snapshot` fallback when quoted columns exist but paid totals are not yet written. */
  priceSnapshot?: unknown;
}): { payoutBaseCents: number; serviceFeeCents: number } {
  const totalCents = resolveTotalPaidCents(params.totalPaidZar, params.amountPaidCents);
  let baseStored =
    params.baseAmountCents != null && Number.isFinite(Number(params.baseAmountCents))
      ? Math.max(0, Math.floor(Number(params.baseAmountCents)))
      : null;
  const feeStored =
    params.serviceFeeCents != null && Number.isFinite(Number(params.serviceFeeCents))
      ? Math.max(0, Math.floor(Number(params.serviceFeeCents)))
      : 0;

  if ((baseStored == null || baseStored <= 0) && params.priceSnapshot != null) {
    const fromSnap = payoutBaseCentsFromPriceSnapshot(params.priceSnapshot);
    if (fromSnap != null && fromSnap > 0) baseStored = fromSnap;
  }

  if (baseStored == null || baseStored <= 0) {
    return { payoutBaseCents: totalCents, serviceFeeCents: 0 };
  }

  if (baseStored + feeStored > totalCents + 5) {
    /**
     * Quoted subtotal + fee exceeds recorded customer total. When nothing is paid yet
     * (`totalCents === 0`) we still use the quoted base so assigned cleaners see a
     * real job earning instead of R0 / "unavailable".
     */
    if (totalCents <= 0) {
      return { payoutBaseCents: baseStored, serviceFeeCents: feeStored };
    }
    return { payoutBaseCents: totalCents, serviceFeeCents: 0 };
  }

  return { payoutBaseCents: baseStored, serviceFeeCents: feeStored };
}

/**
 * Solo hybrid columns from the canonical engine (same rules as display / preview).
 */
export function calculateCleanerPayoutFromBookingRow(params: {
  totalPaidZar: number | null | undefined;
  amountPaidCents: number | null | undefined;
  baseAmountCents?: number | null | undefined;
  serviceFeeCents?: number | null | undefined;
  serviceLabel: string | null | undefined;
  bookingSnapshot: unknown;
  /** Preferred tenure anchor (`cleaners.joined_at`). */
  cleanerJoinedAtIso?: string | null | undefined;
  /**
   * @deprecated Prefer `cleanerJoinedAtIso`. Used when `joined_at` was not loaded by caller.
   */
  cleanerCreatedAtIso?: string | null | undefined;
  /** Booking `date` (YYYY-MM-DD) for calendar tenure vs appointment. */
  bookingDate?: string | null | undefined;
  /** Booking `time` (HH:MM...) for appointment UTC. */
  bookingTime?: string | null | undefined;
  bookingId?: string | null;
  /** Ignored — canonical tenure uses {@link bookingAppointmentIsoUtc} only. */
  nowMs?: number;
}): CleanerPayoutResult {
  const { payoutBaseCents, serviceFeeCents } = resolvePayoutBaseAndServiceFeeCents({
    baseAmountCents: params.baseAmountCents,
    serviceFeeCents: params.serviceFeeCents,
    totalPaidZar: params.totalPaidZar,
    amountPaidCents: params.amountPaidCents,
  });

  const sid = normalizeBookingServiceIdForPayout(params.bookingSnapshot, params.serviceLabel);
  const joinedRaw = String(params.cleanerJoinedAtIso ?? params.cleanerCreatedAtIso ?? "").trim();
  const appt =
    bookingAppointmentIsoUtc(params.bookingDate, params.bookingTime) ??
    (() => {
      const locked =
        params.bookingSnapshot && typeof params.bookingSnapshot === "object" && !Array.isArray(params.bookingSnapshot)
          ? (params.bookingSnapshot as { locked?: { date?: unknown; time?: unknown } }).locked
          : null;
      if (locked && typeof locked === "object") {
        return bookingAppointmentIsoUtc(
          typeof locked.date === "string" ? locked.date : null,
          typeof locked.time === "string" ? locked.time : null,
        );
      }
      return null;
    })();

  const customerTotalCents = resolveTotalPaidCents(params.totalPaidZar, params.amountPaidCents);
  const canonical = resolveCanonicalCleanerPayout({
    bookingId: params.bookingId ?? null,
    serviceId: sid,
    serviceLabel: typeof params.serviceLabel === "string" ? params.serviceLabel : null,
    cleanerJoinedAtIso: joinedRaw || null,
    bookingAppointmentIsoUtc: appt,
    bookingValueCents: payoutBaseCents,
    customerTotalCents: customerTotalCents > 0 ? customerTotalCents : payoutBaseCents + serviceFeeCents,
    isTeamJob: false,
    serviceFeeCents,
  });

  return {
    payoutCents: canonical.cleanerPayoutCents,
    bonusCents: canonical.cleanerBonusCents,
    companyRevenueCents: canonical.companyRevenueFromServiceCents,
    payoutType: canonical.payoutType,
    payoutPercentage: canonical.payoutPercentage,
    payoutBaseCents: payoutBaseCents,
    serviceFeeCents,
  };
}
