import { parseLockedBookingFromUnknown, type LockedBooking } from "@/lib/booking/lockedBooking";
import {
  MIN_REASONABLE_BOOKING_DURATION_MINUTES,
  reportDurationFallbackTo120,
  selectLockedBookingDurationMinutesForPersistence,
} from "@/lib/booking/durationMinutesIntegrity";
import type { CustomerPricingBreakdown } from "@/lib/booking-v2/types";
import { BOOKING_QUOTE_ENGINE_VERSION } from "@/lib/booking/quote/bookingQuoteEngineVersion";
import { durationHoursFromMinutes } from "@/lib/booking/quote/resolveBookingDurationWorkload";
import { legacyHoursToDurationMinutes } from "@/lib/pricing/legacyDurationSelection";
import { jobStartMsJohannesburg } from "@/lib/cleaner/jobStartJohannesburgMs";
import { isStructuredPricingBreakdown } from "@/lib/booking-v2/types";

export type BookingDurationRowLike = {
  id?: string | null;
  duration_minutes?: number | null;
  estimated_duration_minutes?: number | null;
  pricing_summary?: unknown;
  booking_snapshot?: unknown;
  duration_hours?: number | null;
};

function validPersistedMinutes(v: unknown): number | null {
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    v = n;
  }
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const rounded = Math.round(v);
  if (rounded < MIN_REASONABLE_BOOKING_DURATION_MINUTES) return null;
  return rounded;
}

function pricingSummaryFromRow(row: BookingDurationRowLike): CustomerPricingBreakdown | null {
  if (isStructuredPricingBreakdown(row.pricing_summary)) return row.pricing_summary;
  const snap = row.booking_snapshot;
  if (!snap || typeof snap !== "object") return null;
  const ps = (snap as { pricingSummary?: unknown }).pricingSummary;
  return isStructuredPricingBreakdown(ps) ? ps : null;
}

function minutesFromPositiveHours(hours: unknown): number | null {
  if (typeof hours !== "number" || !Number.isFinite(hours) || hours <= 0) return null;
  return legacyHoursToDurationMinutes(hours);
}

/**
 * Resolve authoritative scheduled duration from persisted booking fields (no arbitrary 120/180/240 fallbacks).
 * Prefers minute columns, then pricing/snapshot quote fields, then legacy `duration_hours`.
 */
export function resolvePersistedBookingDurationMinutes(row: BookingDurationRowLike): number | null {
  const fromColumn = validPersistedMinutes(row.duration_minutes);
  if (fromColumn != null) return fromColumn;

  const fromEstimated = validPersistedMinutes(row.estimated_duration_minutes);
  if (fromEstimated != null) return fromEstimated;

  const summary = pricingSummaryFromRow(row);
  const fromSummary = validPersistedMinutes(summary?.estimated_duration_minutes);
  if (fromSummary != null) return fromSummary;

  const fromSummaryHours = minutesFromPositiveHours(summary?.duration_hours);
  if (fromSummaryHours != null) return fromSummaryHours;

  const locked = parseLockedBookingFromUnknown(
    row.booking_snapshot && typeof row.booking_snapshot === "object"
      ? (row.booking_snapshot as { locked?: unknown }).locked
      : null,
  );
  if (locked) {
    const hours = locked.finalHours ?? locked.duration;
    const fromLocked = minutesFromPositiveHours(hours);
    if (fromLocked != null) return fromLocked;
  }

  // Legacy / admin-edited rows often have duration_hours without duration_minutes.
  return minutesFromPositiveHours(row.duration_hours);
}

/** Scheduling paths: persisted duration only; logs when missing (no silent 120/180/240). */
export function resolveSchedulingDurationMinutes(
  row: BookingDurationRowLike,
  source: string,
): number | null {
  const resolved = resolvePersistedBookingDurationMinutes(row);
  if (resolved == null) {
    reportDurationFallbackTo120({
      bookingId: row.id ?? null,
      source: `scheduling_missing_duration:${source}`,
      durationMinutes: row.duration_minutes ?? null,
    });
  }
  return resolved;
}

export function estimatedFinishAtIso(
  dateYmd: string | null | undefined,
  timeHm: string | null | undefined,
  durationMinutes: number,
): string | null {
  const startMs = jobStartMsJohannesburg(dateYmd, timeHm);
  if (startMs == null || !Number.isFinite(durationMinutes) || durationMinutes < 1) return null;
  return new Date(startMs + durationMinutes * 60_000).toISOString();
}

export type AuthoritativeQuotePersistInput = {
  breakdown: CustomerPricingBreakdown;
  schedule?: { date: string; time: string } | null;
};

/** Atomic DB patch: price, duration, workload, finish time, and calculation version stay in sync. */
export function buildAuthoritativeQuotePersistPatch(
  input: AuthoritativeQuotePersistInput,
): Record<string, unknown> {
  const { breakdown } = input;
  const durationMinutes = validPersistedMinutes(breakdown.estimated_duration_minutes);
  if (durationMinutes == null) {
    throw new Error("Authoritative quote persist requires estimated_duration_minutes >= 30");
  }
  if (typeof breakdown.quote_signature !== "string" || !breakdown.quote_signature.trim()) {
    throw new Error("Authoritative quote persist requires quote_signature");
  }

  const durationHours =
    typeof breakdown.duration_hours === "number" && Number.isFinite(breakdown.duration_hours)
      ? breakdown.duration_hours
      : durationHoursFromMinutes(durationMinutes);

  const cleanerWorkload =
    typeof breakdown.cleaner_workload === "number" && Number.isFinite(breakdown.cleaner_workload)
      ? breakdown.cleaner_workload
      : null;

  const calculationVersion =
    typeof breakdown.calculation_version === "number" && Number.isFinite(breakdown.calculation_version)
      ? Math.round(breakdown.calculation_version)
      : BOOKING_QUOTE_ENGINE_VERSION;

  const estimatedFinishAt =
    input.schedule != null
      ? estimatedFinishAtIso(input.schedule.date, input.schedule.time, durationMinutes)
      : null;

  return {
    pricing_summary: breakdown,
    total_paid_zar: breakdown.estimated_total,
    total_price: Math.round(breakdown.estimated_total),
    amount_paid_cents: Math.round(breakdown.estimated_total * 100),
    service_fee_cents: Math.round(breakdown.service_fee * 100),
    base_amount_cents: Math.round(breakdown.subtotal_before_service_fee * 100),
    recurring_discount_cents: Math.round(breakdown.recurring_discount * 100),
    duration_minutes: durationMinutes,
    estimated_duration_minutes: durationMinutes,
    duration_hours: durationHours,
    ...(cleanerWorkload != null ? { cleaner_workload: cleanerWorkload } : {}),
    ...(estimatedFinishAt ? { estimated_finish_at: estimatedFinishAt } : {}),
    quote_calculation_version: calculationVersion,
  };
}

/** Duration + pricing_summary sync without overwriting Paystack-collected payment amounts. */
export function buildAuthoritativeQuoteDurationOnlyPatch(
  input: AuthoritativeQuotePersistInput,
): Record<string, unknown> {
  const full = buildAuthoritativeQuotePersistPatch(input);
  const {
    amount_paid_cents: _amountPaid,
    total_paid_cents: _totalPaid,
    total_paid_zar: _totalPaidZar,
    total_price: _totalPrice,
    base_amount_cents: _base,
    service_fee_cents: _fee,
    recurring_discount_cents: _discount,
    ...durationOnly
  } = full;
  return durationOnly;
}

/** V2 Paystack finalize: copy authoritative duration from pricing_summary when legacy lock is absent. */
export function authoritativeDurationPatchFromBookingRow(row: {
  id?: string | null;
  duration_minutes?: number | null;
  estimated_duration_minutes?: number | null;
  pricing_summary?: unknown;
  booking_snapshot?: unknown;
  date?: string | null;
  time?: string | null;
  duration_hours?: number | null;
  cleaner_workload?: number | null;
  quote_calculation_version?: number | null;
}): Record<string, unknown> {
  const summary = pricingSummaryFromRow(row);
  if (summary?.quote_signature && validPersistedMinutes(summary.estimated_duration_minutes) != null) {
    try {
      return buildAuthoritativeQuoteDurationOnlyPatch({
        breakdown: summary,
        schedule: row.date && row.time ? { date: row.date, time: row.time } : null,
      });
    } catch {
      /* fall through to column resolution */
    }
  }

  const minutes = resolvePersistedBookingDurationMinutes(row);
  if (minutes == null) return {};

  const patch: Record<string, unknown> = {
    duration_minutes: minutes,
    estimated_duration_minutes: minutes,
    duration_hours: durationHoursFromMinutes(minutes),
  };

  const finishAt = estimatedFinishAtIso(row.date, row.time, minutes);
  if (finishAt) patch.estimated_finish_at = finishAt;

  if (summary) {
    if (typeof summary.cleaner_workload === "number") patch.cleaner_workload = summary.cleaner_workload;
    if (typeof summary.calculation_version === "number") {
      patch.quote_calculation_version = summary.calculation_version;
    }
  }

  return patch;
}

/** Legacy Paystack / pending-payment path — persist duration fields from locked quote hours. */
export function buildLegacyLockDurationPersistPatch(params: {
  locked: LockedBooking | null | undefined;
  schedule?: { date: string; time: string } | null;
}): Record<string, unknown> {
  const minutes = selectLockedBookingDurationMinutesForPersistence(params.locked ?? null);
  if (minutes == null) return {};

  const durationHours = durationHoursFromMinutes(minutes);
  const estimatedFinishAt =
    params.schedule != null
      ? estimatedFinishAtIso(params.schedule.date, params.schedule.time, minutes)
      : null;

  return {
    duration_minutes: minutes,
    estimated_duration_minutes: minutes,
    duration_hours: durationHours,
    ...(estimatedFinishAt ? { estimated_finish_at: estimatedFinishAt } : {}),
    quote_calculation_version: BOOKING_QUOTE_ENGINE_VERSION,
  };
}
