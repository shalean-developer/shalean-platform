import {
  bookingAppointmentIsoUtc,
  normalizeBookingServiceIdForPayout,
  resolveCanonicalCleanerPayout,
  type CanonicalPayoutResult,
} from "@/lib/payout/canonicalCleanerPayout";
import { resolvePayoutBaseAndServiceFeeCents } from "@/lib/payout/calculateCleanerPayout";

/**
 * Stable machine-readable codes for the per-offer earnings snapshot resolver.
 * Used as `dispatch_offers.earnings_snapshot_source` and as `source` in the
 * structured `cleaner_offer_job_earning_*` system_logs rows. Stable strings —
 * dashboards filter on these.
 */
export const OFFER_EARNINGS_SOURCE = {
  /** Resolved from the canonical engine — single value works for solo standard, solo fixed special, and team. */
  CANONICAL: "canonical",
  /** Booking has no payment basis (`total_paid_zar`, `total_paid_cents`, `amount_paid_cents`, `base_amount_cents` all 0/null) and the service is solo standard (which is % of basis). Team and fixed specials still resolve to R250 even with 0 basis. */
  MISSING_PAYMENT_BASIS: "missing_payment_basis",
  /** `bookingAppointmentIsoUtc` could not be derived (e.g. invalid date/time) — tenure cannot be computed for solo standard. Team / fixed specials still resolve to R250 in that case. */
  MISSING_APPOINTMENT_INSTANT: "missing_appointment_instant",
  /** Cleaner row has no `joined_at` / `created_at` so tenure defaults to 0 (junior rate). For solo standard this is treated as a degraded resolve, not a hard miss — we still surface the amount but flag the gap. */
  CLEANER_TENURE_UNKNOWN: "cleaner_tenure_unknown",
} as const;

export type OfferEarningsSource = (typeof OFFER_EARNINGS_SOURCE)[keyof typeof OFFER_EARNINGS_SOURCE];

/**
 * Booking columns required to compute the canonical per-offer cleaner share.
 * Loaded once by the caller (dispatch creation, preview, repair script) so this
 * helper stays pure (no DB).
 */
export type OfferEarningsBookingInput = {
  is_team_job?: boolean | null;
  service?: string | null;
  booking_snapshot?: unknown;
  date?: string | null;
  time?: string | null;
  base_amount_cents?: number | null;
  service_fee_cents?: number | null;
  total_paid_zar?: number | null;
  total_paid_cents?: number | null;
  amount_paid_cents?: number | null;
  price_snapshot?: unknown;
  /** Roster size at appointment for team jobs; falls back to 1 inside the canonical engine. */
  team_member_count_snapshot?: number | null;
};

/**
 * Cleaner columns required to compute tenure (solo standard only).
 * Team and fixed-special services do not consult tenure.
 */
export type OfferEarningsCleanerInput = {
  joined_at?: string | null;
  created_at?: string | null;
};

export type ComputeCleanerOfferEarningsSnapshotOk = {
  ok: true;
  amount_cents: number;
  source: OfferEarningsSource;
  missingReason: null;
  diagnostics: {
    service_id: string;
    is_team_job: boolean;
    payout_base_cents: number;
    /** Echo of {@link CanonicalPayoutResult.diagnostics} with payout_mode + tenure for system_logs. */
    payout_mode: CanonicalPayoutResult["diagnostics"]["payout_mode"];
    tenure_months: number;
    payout_percentage: number | null;
    /** Snapshot of `team_member_count_snapshot` actually fed into the engine (team jobs). */
    team_cleaner_count?: number;
  };
};

export type ComputeCleanerOfferEarningsSnapshotMiss = {
  ok: false;
  amount_cents: null;
  source: OfferEarningsSource;
  missingReason: string;
  diagnostics: {
    service_id: string;
    is_team_job: boolean;
    payout_base_cents: number;
    appointment_iso: string | null;
    cleaner_joined_at: string | null;
  };
};

export type ComputeCleanerOfferEarningsSnapshotResult =
  | ComputeCleanerOfferEarningsSnapshotOk
  | ComputeCleanerOfferEarningsSnapshotMiss;

/**
 * Pure per-offer earnings resolver. Returns the amount the cleaner would earn
 * if they accepted this specific offer right now, plus a stable diagnostic
 * source code. Used at dispatch-offer creation time (persisted to
 * `dispatch_offers.display_earnings_cents`) and as the truth for the
 * `/api/cleaner/offers` runtime fallback / repair script. No DB access.
 *
 * Precedence inside the canonical engine (delegated to
 * {@link resolveCanonicalCleanerPayout}):
 *   - Team job  → R250 per cleaner (constant; tenure ignored).
 *   - Solo fixed special (deep / move / carpet) → R250 (constant; tenure ignored).
 *   - Solo standard → 60% (junior) or 70% (>=4 mo tenure) of the payout basis,
 *     clamped to [R250, R350].
 *
 * Failure modes — these never throw; they return `ok: false` so callers can
 * log a structured diagnostic and either fall back or persist `null`.
 *   - Solo standard with zero payment basis → cannot compute %, miss with
 *     {@link OFFER_EARNINGS_SOURCE.MISSING_PAYMENT_BASIS}.
 *   - Solo standard with no parseable appointment instant → tenure unknown,
 *     miss with {@link OFFER_EARNINGS_SOURCE.MISSING_APPOINTMENT_INSTANT}.
 *   - Cleaner has neither `joined_at` nor `created_at` → still resolves at the
 *     junior rate but surfaces {@link OFFER_EARNINGS_SOURCE.CLEANER_TENURE_UNKNOWN}
 *     so observability can chase the data gap. Team / fixed specials succeed.
 */
export function computeCleanerOfferEarningsSnapshot(params: {
  booking: OfferEarningsBookingInput;
  cleaner: OfferEarningsCleanerInput;
}): ComputeCleanerOfferEarningsSnapshotResult {
  const booking = params.booking;
  const cleaner = params.cleaner;
  const isTeamJob = booking.is_team_job === true;

  const serviceId = String(
    normalizeBookingServiceIdForPayout(booking.booking_snapshot ?? null, booking.service ?? null),
  );
  const isFixedSpecial = serviceId === "deep" || serviceId === "move" || serviceId === "carpet";

  const { payoutBaseCents, serviceFeeCents } = resolvePayoutBaseAndServiceFeeCents({
    baseAmountCents: booking.base_amount_cents,
    serviceFeeCents: booking.service_fee_cents,
    totalPaidZar: booking.total_paid_zar,
    amountPaidCents: booking.total_paid_cents ?? booking.amount_paid_cents,
    priceSnapshot: booking.price_snapshot,
  });

  const appointmentIso = bookingAppointmentIsoUtc(booking.date ?? null, booking.time ?? null);
  const cleanerJoinedAt = String(cleaner.joined_at ?? cleaner.created_at ?? "").trim() || null;

  /** Solo standard cannot compute without a payment basis (it is % of base). Team and fixed specials still produce R250. */
  if (!isTeamJob && !isFixedSpecial && payoutBaseCents <= 0) {
    return {
      ok: false,
      amount_cents: null,
      source: OFFER_EARNINGS_SOURCE.MISSING_PAYMENT_BASIS,
      missingReason: "solo_standard_without_payment_basis",
      diagnostics: {
        service_id: serviceId,
        is_team_job: false,
        payout_base_cents: 0,
        appointment_iso: appointmentIso,
        cleaner_joined_at: cleanerJoinedAt,
      },
    };
  }

  /** Solo standard with no parseable appointment cannot compute tenure → no rate. Team / fixed specials are tenure-agnostic. */
  if (!isTeamJob && !isFixedSpecial && (appointmentIso == null || cleanerJoinedAt == null)) {
    /** Cleaner-only data gap is recoverable (junior rate); appointment-instant gap is harder. We tag both so we can split them in observability. */
    if (appointmentIso == null) {
      return {
        ok: false,
        amount_cents: null,
        source: OFFER_EARNINGS_SOURCE.MISSING_APPOINTMENT_INSTANT,
        missingReason: "booking_missing_date_or_time",
        diagnostics: {
          service_id: serviceId,
          is_team_job: false,
          payout_base_cents: payoutBaseCents,
          appointment_iso: null,
          cleaner_joined_at: cleanerJoinedAt,
        },
      };
    }
  }

  const teamCount =
    typeof booking.team_member_count_snapshot === "number" &&
    Number.isFinite(booking.team_member_count_snapshot) &&
    booking.team_member_count_snapshot > 0
      ? Math.floor(booking.team_member_count_snapshot)
      : null;

  const canonical = resolveCanonicalCleanerPayout({
    serviceId,
    serviceLabel: booking.service ?? null,
    cleanerJoinedAtIso: cleanerJoinedAt,
    bookingAppointmentIsoUtc: appointmentIso,
    bookingValueCents: payoutBaseCents,
    isTeamJob,
    teamCleanerCount: teamCount,
    serviceFeeCents,
  });

  const amount = Math.max(0, Math.floor(Number(canonical.displayEarningsCents) || 0));

  /** Solo standard at the junior rate (because tenure couldn't be derived) is degraded but still a real number — surface it with the diagnostic source. */
  const tenureUnknown = !isTeamJob && !isFixedSpecial && cleanerJoinedAt == null;
  const source: OfferEarningsSource = tenureUnknown
    ? OFFER_EARNINGS_SOURCE.CLEANER_TENURE_UNKNOWN
    : OFFER_EARNINGS_SOURCE.CANONICAL;

  return {
    ok: true,
    amount_cents: amount,
    source,
    missingReason: null,
    diagnostics: {
      service_id: serviceId,
      is_team_job: isTeamJob,
      payout_base_cents: payoutBaseCents,
      payout_mode: canonical.diagnostics.payout_mode,
      tenure_months: canonical.tenureMonths,
      payout_percentage: canonical.payoutPercentage,
      ...(isTeamJob && canonical.diagnostics.team_cleaner_count != null
        ? { team_cleaner_count: canonical.diagnostics.team_cleaner_count }
        : {}),
    },
  };
}
