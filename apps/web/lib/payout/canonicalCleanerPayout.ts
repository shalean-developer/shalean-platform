/**
 * Single source of truth for Shalean cleaner job payout rules (solo + team per-cleaner fixed).
 * Pure functions only — no Supabase, no Date.now() for tenure or appointment math.
 *
 * **Rollback:** set `USE_LEGACY_PAYOUT_ENGINE=true` to restore v1 `computeBookingEarnings` (DB caps)
 * and legacy line-item share allocation without `canonicalDisplayCents`.
 */

import type { BookingServiceId } from "@/components/booking/serviceCategories";
import { parseBookingServiceId } from "@/components/booking/serviceCategories";

export const CANONICAL_EARNINGS_MODEL_VERSION = "v2_2026_canonical";

/**
 * @deprecated Use {@link FIXED_SPECIAL_PAYOUT_CENTS} / team per-cleaner semantics; kept for legacy tests imports.
 */
export const CANONICAL_TEAM_POOL_DISPLAY_CENTS = 25_000;

/** Fixed-price specialised services (catalog ids). */
const FIXED_CATALOG_IDS = new Set<BookingServiceId>(["deep", "move", "carpet"]);

/** R250 fixed (cents) — solo fixed specials and **each** cleaner on a team job. */
export const FIXED_SPECIAL_PAYOUT_CENTS = 25_000;
export const MIN_STANDARD_BASE_PAYOUT_CENTS = 25_000;
export const MAX_STANDARD_BASE_PAYOUT_CENTS = 35_000;

const NEW_CLEANER_RATE = 0.6;
const EXPERIENCED_CLEANER_RATE = 0.7;
const TENURE_MONTHS_THRESHOLD = 4;

export type CanonicalPayoutBillingType =
  | "prepaid"
  | "recurring_invoice"
  | "monthly_contract"
  | "pay_later"
  | (string & {});

/**
 * Explicit inputs — callers resolve DB / booking row fields before invoking the engine.
 */
export type CanonicalPayoutInput = {
  bookingId?: string | null;
  /** Normalised catalog service id (see {@link normalizeBookingServiceIdForPayout}). */
  serviceId: string;
  serviceLabel?: string | null;
  /** `cleaners.joined_at` preferred; null / empty → junior tenure (0 months). */
  cleanerJoinedAtIso: string | null;
  /**
   * Booking appointment instant as ISO-8601 UTC (e.g. `2026-04-20T10:00:00.000Z`).
   * Null / invalid → tenure treated as **0 months** (junior rate) for safety.
   */
  bookingAppointmentIsoUtc: string | null;
  /** Payout basis in minor units (ZAR cents), already resolved for prepaid vs quoted accrual. */
  bookingValueCents: number;
  billingType?: CanonicalPayoutBillingType | null;
  isTeamJob: boolean;
  /**
   * Active cleaners on the team job at appointment time (roster / membership count).
   * When `isTeamJob`, defaults to **1** if missing or zero so totals stay finite.
   */
  teamCleanerCount?: number | null;
  /** Platform service fee (cents) added to company revenue only. */
  serviceFeeCents?: number | null;
};

export type CanonicalPayoutDiagnostics = {
  payout_source: "canonical";
  booking_id?: string | null;
  service_id: string;
  tenure_months: number;
  payout_percentage: number | null;
  fixed_service_override: boolean;
  payout_before_clamp_cents: number | null;
  payout_after_clamp_cents: number | null;
  bonus_cents: number;
  final_display_cents: number;
  is_team_job: boolean;
  payout_mode?: "solo_percentage" | "solo_fixed_special" | "team_per_cleaner_fixed";
  team_cleaner_count?: number;
  booking_total_team_payout_cents?: number;
  payout_per_cleaner_cents?: number;
  team_rule_applied?: boolean;
};

export type CanonicalPayoutResult = {
  /**
   * Per-cleaner earnings shown on job UIs. Solo: full job earnings. Team: **R250 each** (not N×250).
   */
  displayEarningsCents: number;
  payoutEarningsCents: number;
  /** Solo: raw % or fixed. Team: **N × R250** total cleaner obligation for reporting / caps. */
  internalEarningsCents: number;
  /** Hybrid ledger: capped base paid as `cleaner_payout_cents`. */
  cleanerPayoutCents: number;
  cleanerBonusCents: number;
  /** Excludes service fee; persist adds fee to company column. */
  companyRevenueFromServiceCents: number;
  payoutPercentage: number | null;
  payoutType: "percentage" | "fixed_special" | "team_per_cleaner_fixed" | "team_pool";
  tenureMonths: number;
  fixedServiceOverride: boolean;
  earningsPercentageApplied: number | null;
  /**
   * Semantic cap: standard max base; fixed solo / **per-cleaner team** use {@link FIXED_SPECIAL_PAYOUT_CENTS}.
   */
  earningsCapCentsApplied: number | null;
  earningsModelVersion: string;
  diagnostics: CanonicalPayoutDiagnostics;
};

export function useLegacyPayoutEngine(): boolean {
  return process.env.USE_LEGACY_PAYOUT_ENGINE === "true";
}

/**
 * Appointment instant for tenure (UTC Z). Requires `YYYY-MM-DD` date; time optional `HH:MM`.
 */
export function bookingAppointmentIsoUtc(
  dateYmd: string | null | undefined,
  timeHm: string | null | undefined,
): string | null {
  const d = String(dateYmd ?? "").trim();
  const t = String(timeHm ?? "").trim().slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  if (/^\d{2}:\d{2}$/.test(t)) return `${d}T${t}:00.000Z`;
  return `${d}T12:00:00.000Z`;
}

/**
 * Calendar months between cleaner anchor (`joined_at` / `created_at`) and booking appointment UTC.
 * Same boundary semantics as historical `computeBookingEarnings` (day-of-month rollback).
 */
export function calendarMonthsBetweenCleanerJoinedAndAppointment(
  cleanerJoinedAtIso: string,
  appointmentIsoUtc: string,
): number {
  const d1 = new Date(cleanerJoinedAtIso);
  const d2 = new Date(appointmentIsoUtc);
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) {
    return 0;
  }
  let months = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
  if (d2.getDate() < d1.getDate()) {
    months -= 1;
  }
  return Math.max(months, 0);
}

/**
 * Single normaliser for snapshot + free-text labels (avoids heuristic drift across modules).
 */
export function normalizeBookingServiceIdForPayout(
  bookingSnapshot: unknown,
  serviceLabel: string | null | undefined,
): BookingServiceId | "standard" {
  if (bookingSnapshot && typeof bookingSnapshot === "object" && !Array.isArray(bookingSnapshot)) {
    const locked = (bookingSnapshot as { locked?: unknown }).locked;
    if (locked && typeof locked === "object" && !Array.isArray(locked)) {
      const parsed = parseBookingServiceId((locked as { service?: unknown }).service);
      if (parsed) return parsed;
    }
  }
  const s = String(serviceLabel ?? "").toLowerCase();
  if (s.includes("deep")) return "deep";
  if (s.includes("move")) return "move";
  if (s.includes("airbnb")) return "airbnb";
  if (s.includes("carpet")) return "carpet";
  return "standard";
}

export function isFixedPayoutSpecialFromNormalizedId(serviceId: string): boolean {
  return FIXED_CATALOG_IDS.has(serviceId as BookingServiceId);
}

/** Detect fixed specials using normalised id first, then label heuristics (legacy bookings). */
export function isFixedPayoutSpecial(serviceId: BookingServiceId | null, serviceLabel: string | null): boolean {
  if (serviceId && FIXED_CATALOG_IDS.has(serviceId)) return true;
  const s = (serviceLabel ?? "").toLowerCase();
  if (!s) return false;
  if (/\bdeep\b/i.test(s) || s.includes("deep clean")) return true;
  if (/\bmove\b/i.test(s) || s.includes("move in") || s.includes("move out")) return true;
  if (/\bcarpet\b/i.test(s)) return true;
  return false;
}

/**
 * Team jobs (any service, including deep/move/carpet): **each** active cleaner earns exactly R250.
 * Overrides % / tenure / clamps / roster weights. See {@link FIXED_SPECIAL_PAYOUT_CENTS}.
 */
export function resolveCanonicalCleanerPayout(input: CanonicalPayoutInput): CanonicalPayoutResult {
  const serviceId = String(input.serviceId ?? "").trim() || "standard";
  const total = Math.max(0, Math.floor(Number(input.bookingValueCents) || 0));
  const fee = Math.max(0, Math.floor(Number(input.serviceFeeCents ?? 0) || 0));

  if (input.isTeamJob) {
    const teamCountRaw = Math.floor(Number(input.teamCleanerCount ?? 0) || 0);
    const teamCount = Math.max(1, teamCountRaw);
    const per = FIXED_SPECIAL_PAYOUT_CENTS;
    const totalTeamPayout = per * teamCount;
    const diag: CanonicalPayoutDiagnostics = {
      payout_source: "canonical",
      booking_id: input.bookingId ?? null,
      service_id: serviceId,
      tenure_months: 0,
      payout_percentage: null,
      fixed_service_override: false,
      payout_before_clamp_cents: null,
      payout_after_clamp_cents: null,
      bonus_cents: 0,
      final_display_cents: per,
      is_team_job: true,
      payout_mode: "team_per_cleaner_fixed",
      team_cleaner_count: teamCount,
      booking_total_team_payout_cents: totalTeamPayout,
      payout_per_cleaner_cents: per,
      team_rule_applied: true,
    };
    return {
      displayEarningsCents: per,
      payoutEarningsCents: per,
      internalEarningsCents: totalTeamPayout,
      cleanerPayoutCents: 0,
      cleanerBonusCents: 0,
      companyRevenueFromServiceCents: Math.max(0, total + fee),
      payoutPercentage: null,
      payoutType: "team_per_cleaner_fixed",
      tenureMonths: 0,
      fixedServiceOverride: false,
      earningsPercentageApplied: null,
      earningsCapCentsApplied: per,
      earningsModelVersion: CANONICAL_EARNINGS_MODEL_VERSION,
      diagnostics: diag,
    };
  }

  const sid = serviceId as BookingServiceId | "standard";
  const fixed = isFixedPayoutSpecialFromNormalizedId(sid);
  if (fixed) {
    const payout = FIXED_SPECIAL_PAYOUT_CENTS;
    const bonus = 0;
    const display = payout + bonus;
    const company = Math.max(0, total - payout - bonus);
    const diag: CanonicalPayoutDiagnostics = {
      payout_source: "canonical",
      booking_id: input.bookingId ?? null,
      service_id: serviceId,
      tenure_months: 0,
      payout_percentage: null,
      fixed_service_override: true,
      payout_before_clamp_cents: payout,
      payout_after_clamp_cents: payout,
      bonus_cents: bonus,
      final_display_cents: display,
      is_team_job: false,
      payout_mode: "solo_fixed_special",
    };
    return {
      displayEarningsCents: display,
      payoutEarningsCents: display,
      internalEarningsCents: display,
      cleanerPayoutCents: payout,
      cleanerBonusCents: bonus,
      companyRevenueFromServiceCents: company,
      payoutPercentage: null,
      payoutType: "fixed_special",
      tenureMonths: 0,
      fixedServiceOverride: true,
      earningsPercentageApplied: null,
      earningsCapCentsApplied: FIXED_SPECIAL_PAYOUT_CENTS,
      earningsModelVersion: CANONICAL_EARNINGS_MODEL_VERSION,
      diagnostics: diag,
    };
  }

  const joined = String(input.cleanerJoinedAtIso ?? "").trim();
  const appt = String(input.bookingAppointmentIsoUtc ?? "").trim();
  const tenureMonths =
    joined && appt ? calendarMonthsBetweenCleanerJoinedAndAppointment(joined, appt) : 0;
  const percentage = tenureMonths < TENURE_MONTHS_THRESHOLD ? NEW_CLEANER_RATE : EXPERIENCED_CLEANER_RATE;

  if (total === 0) {
    const diag: CanonicalPayoutDiagnostics = {
      payout_source: "canonical",
      booking_id: input.bookingId ?? null,
      service_id: serviceId,
      tenure_months: tenureMonths,
      payout_percentage: percentage,
      fixed_service_override: false,
      payout_before_clamp_cents: 0,
      payout_after_clamp_cents: 0,
      bonus_cents: 0,
      final_display_cents: 0,
      is_team_job: false,
      payout_mode: "solo_percentage",
    };
    return {
      displayEarningsCents: 0,
      payoutEarningsCents: 0,
      internalEarningsCents: 0,
      cleanerPayoutCents: 0,
      cleanerBonusCents: 0,
      companyRevenueFromServiceCents: Math.max(0, total + fee),
      payoutPercentage: percentage,
      payoutType: "percentage",
      tenureMonths,
      fixedServiceOverride: false,
      earningsPercentageApplied: percentage,
      earningsCapCentsApplied: MAX_STANDARD_BASE_PAYOUT_CENTS,
      earningsModelVersion: CANONICAL_EARNINGS_MODEL_VERSION,
      diagnostics: diag,
    };
  }

  /**
   * Standard: raw % of booking value → clamp [R250, R350] on **base** → payout = min(clampedBase, total);
   * excess above R350 base becomes bonus (capped by remaining total after base).
   */
  const rawPercentageCents = Math.round(total * percentage);
  const baseBeforeTotalCap = Math.min(
    Math.max(rawPercentageCents, MIN_STANDARD_BASE_PAYOUT_CENTS),
    MAX_STANDARD_BASE_PAYOUT_CENTS,
  );
  const cleanerPayoutCents = Math.min(baseBeforeTotalCap, total);
  const rawBonusCents = Math.max(0, rawPercentageCents - MAX_STANDARD_BASE_PAYOUT_CENTS);
  const cleanerBonusCents = Math.min(rawBonusCents, Math.max(0, total - cleanerPayoutCents));
  const displayEarningsCents = cleanerPayoutCents + cleanerBonusCents;
  const companyRevenueFromServiceCents = Math.max(0, total - cleanerPayoutCents - cleanerBonusCents);

  const diag: CanonicalPayoutDiagnostics = {
    payout_source: "canonical",
    booking_id: input.bookingId ?? null,
    service_id: serviceId,
    tenure_months: tenureMonths,
    payout_percentage: percentage,
    fixed_service_override: false,
    payout_before_clamp_cents: rawPercentageCents,
    payout_after_clamp_cents: cleanerPayoutCents,
    bonus_cents: cleanerBonusCents,
    final_display_cents: displayEarningsCents,
    is_team_job: false,
    payout_mode: "solo_percentage",
  };

  return {
    displayEarningsCents,
    payoutEarningsCents: displayEarningsCents,
    internalEarningsCents: rawPercentageCents,
    cleanerPayoutCents,
    cleanerBonusCents,
    companyRevenueFromServiceCents,
    payoutPercentage: percentage,
    payoutType: "percentage",
    tenureMonths,
    fixedServiceOverride: false,
    earningsPercentageApplied: percentage,
    earningsCapCentsApplied: MAX_STANDARD_BASE_PAYOUT_CENTS,
    earningsModelVersion: CANONICAL_EARNINGS_MODEL_VERSION,
    diagnostics: diag,
  };
}
