/**
 * Single source of truth for Shalean cleaner job payout rules (v3).
 * Pure functions only — no Supabase, no Date.now() for tenure or appointment math.
 *
 * **Rollback:** set `USE_LEGACY_PAYOUT_ENGINE=true` to restore v1 `computeBookingEarnings` (DB caps)
 * and legacy line-item share allocation without `canonicalDisplayCents`.
 */

import type { BookingServiceId } from "@/components/booking/serviceCategories";
import { parseBookingServiceId } from "@/components/booking/serviceCategories";
import {
  buildBookingEarningsSummary,
  type BookingEarningsSummary,
} from "@/lib/payout/bookingEarningsSummary";

export const CANONICAL_EARNINGS_MODEL_VERSION = "v3_2026_earnings_rules";

/**
 * @deprecated Use {@link TEAM_MEMBER_FIXED_PAYOUT_CENTS}; kept for legacy tests imports.
 */
export const CANONICAL_TEAM_POOL_DISPLAY_CENTS = 25_000;

/** Fixed-price specialised services (catalog ids). */
const FIXED_CATALOG_IDS = new Set<BookingServiceId>(["deep", "move", "carpet"]);

/** R250 fixed — solo fixed specials and team members on fixed-service jobs. */
export const FIXED_SPECIAL_PAYOUT_CENTS = 25_000;
export const TEAM_MEMBER_FIXED_PAYOUT_CENTS = 25_000;
export const TEAM_LEADER_FIXED_PAYOUT_CENTS = 27_000;
export const MIN_STANDARD_BASE_PAYOUT_CENTS = 25_000;
export const MAX_STANDARD_BASE_PAYOUT_CENTS = 30_000;

const NEW_CLEANER_RATE = 0.6;
const EXPERIENCED_CLEANER_RATE = 0.7;
const TENURE_MONTHS_THRESHOLD = 4;

export type CanonicalPayoutBillingType =
  | "prepaid"
  | "recurring_invoice"
  | "monthly_contract"
  | "pay_later"
  | (string & {});

export type CanonicalEarningsAdjustment = {
  cleaner_id: string;
  amount_cents: number;
  reason?: string;
  type?: string;
};

/**
 * Explicit inputs — callers resolve DB / booking row fields before invoking the engine.
 */
export type CanonicalPayoutInput = {
  bookingId?: string | null;
  /** Normalised catalog service id (see {@link normalizeBookingServiceIdForPayout}). */
  serviceId: string;
  serviceLabel?: string | null;
  /** Solo / lead tenure: `cleaners.joined_at` preferred; null → junior (0 months). */
  cleanerJoinedAtIso: string | null;
  /** Team % jobs: lead cleaner joined_at (falls back to cleanerJoinedAtIso). */
  teamLeaderJoinedAtIso?: string | null;
  /**
   * Booking appointment instant as ISO-8601 UTC (e.g. `2026-04-20T10:00:00.000Z`).
   * Null / invalid → tenure treated as **0 months** (junior rate) for safety.
   */
  bookingAppointmentIsoUtc: string | null;
  /** Eligible payout basis in minor units (ZAR cents), excludes platform service fee. */
  bookingValueCents: number;
  /** Full customer total in cents (for company revenue). */
  customerTotalCents?: number | null;
  billingType?: CanonicalPayoutBillingType | null;
  isTeamJob: boolean;
  teamId?: string | null;
  teamLeaderId?: string | null;
  participantCleanerIds?: string[] | null;
  rosterRoles?: Array<{ cleaner_id: string; role?: string | null }> | null;
  /**
   * Active cleaners on the team job at appointment time (roster / membership count).
   * When `isTeamJob`, defaults to participant count or **1** if missing.
   */
  teamCleanerCount?: number | null;
  /** Platform service fee (cents) — included in customer total, not cleaner eligible amount. */
  serviceFeeCents?: number | null;
  adjustments?: CanonicalEarningsAdjustment[] | null;
  computedAtIso?: string;
  /** Solo job assigned cleaner (for earnings_summary participant list). */
  soloCleanerId?: string | null;
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
  payout_mode?:
    | "solo_percentage"
    | "solo_fixed_special"
    | "team_percentage_parity"
    | "team_fixed_with_leader"
    | "team_per_cleaner_fixed";
  team_cleaner_count?: number;
  booking_total_team_payout_cents?: number;
  payout_per_cleaner_cents?: number;
  team_leader_payout_cents?: number;
  team_rule_applied?: boolean;
};

export type CanonicalPayoutResult = {
  /**
   * Per-cleaner earnings shown on job UIs. Solo: full job earnings. Team: per-cleaner base (before explicit bonus).
   */
  displayEarningsCents: number;
  payoutEarningsCents: number;
  /** Total cleaner obligation across all participants (incl. explicit bonuses in summary). */
  internalEarningsCents: number;
  /** Hybrid ledger: base paid as `cleaner_payout_cents` (solo). */
  cleanerPayoutCents: number;
  /** Explicit bonuses only — no automatic overflow above cap. */
  cleanerBonusCents: number;
  companyRevenueFromServiceCents: number;
  payoutPercentage: number | null;
  payoutType:
    | "percentage"
    | "fixed_special"
    | "team_per_cleaner_fixed"
    | "team_fixed_with_leader"
    | "team_percentage_parity"
    | "team_pool";
  tenureMonths: number;
  fixedServiceOverride: boolean;
  earningsPercentageApplied: number | null;
  earningsCapCentsApplied: number | null;
  earningsModelVersion: string;
  diagnostics: CanonicalPayoutDiagnostics;
  earningsSummary: BookingEarningsSummary | null;
  perCleanerBaseCents: Map<string, number>;
};

export function useLegacyPayoutEngine(): boolean {
  return process.env.USE_LEGACY_PAYOUT_ENGINE === "true";
}

export function clampStandardEarningCents(rawCents: number): number {
  const raw = Math.max(0, Math.round(rawCents));
  return Math.min(Math.max(raw, MIN_STANDARD_BASE_PAYOUT_CENTS), MAX_STANDARD_BASE_PAYOUT_CENTS);
}

export function resolveTenurePercentage(tenureMonths: number): number {
  return tenureMonths < TENURE_MONTHS_THRESHOLD ? NEW_CLEANER_RATE : EXPERIENCED_CLEANER_RATE;
}

export function resolveTenureMonths(
  cleanerJoinedAtIso: string | null | undefined,
  bookingAppointmentIsoUtc: string | null | undefined,
): number {
  const joined = String(cleanerJoinedAtIso ?? "").trim();
  const appt = String(bookingAppointmentIsoUtc ?? "").trim();
  if (!joined || !appt) return 0;
  return calendarMonthsBetweenCleanerJoinedAndAppointment(joined, appt);
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

function uuidClean(id: string | null | undefined): string {
  const s = String(id ?? "").trim();
  return /^[0-9a-f-]{36}$/i.test(s) ? s : "";
}

function resolveParticipantIds(input: CanonicalPayoutInput): string[] {
  const fromInput = (input.participantCleanerIds ?? [])
    .map((id) => uuidClean(id))
    .filter(Boolean);
  if (fromInput.length > 0) return [...new Set(fromInput)];
  if (!input.isTeamJob) {
    const solo = uuidClean(input.soloCleanerId);
    return solo ? [solo] : [];
  }
  const count = Math.max(1, Math.floor(Number(input.teamCleanerCount ?? 0) || 0) || 1);
  return Array.from({ length: count }, (_, i) => `placeholder-${i}`);
}

function resolveTeamLeaderId(
  input: CanonicalPayoutInput,
  participantIds: string[],
): string | null {
  const explicit = uuidClean(input.teamLeaderId);
  if (explicit && participantIds.includes(explicit)) return explicit;
  const fromRoster = input.rosterRoles?.find((r) => String(r.role ?? "").toLowerCase() === "lead");
  const rosterLead = uuidClean(fromRoster?.cleaner_id);
  if (rosterLead && participantIds.includes(rosterLead)) return rosterLead;
  return participantIds[0] ?? null;
}

function computeStandardPercentageEarning(eligibleCents: number, percentage: number): {
  rawCents: number;
  clampedCents: number;
} {
  const raw = Math.round(Math.max(0, eligibleCents) * percentage);
  const clamped = eligibleCents <= 0 ? 0 : clampStandardEarningCents(raw);
  return { rawCents: raw, clampedCents: clamped };
}

function buildResult(params: {
  input: CanonicalPayoutInput;
  serviceId: string;
  eligibleCents: number;
  customerTotalCents: number;
  isTeamJob: boolean;
  fixedService: boolean;
  tenureMonths: number;
  percentage: number | null;
  perCleanerBase: Map<string, number>;
  payoutMode: CanonicalPayoutDiagnostics["payout_mode"];
  payoutType: CanonicalPayoutResult["payoutType"];
  displayCents: number;
  soloPayoutCents: number;
  soloBonusCents: number;
  rawBeforeClamp: number | null;
  rawAfterClamp: number | null;
}): CanonicalPayoutResult {
  const participantIds = [...params.perCleanerBase.keys()].filter((id) => !id.startsWith("placeholder-"));
  const effectiveParticipants =
    participantIds.length > 0 ? participantIds : Array.from(params.perCleanerBase.keys());

  const teamLeaderId = params.isTeamJob ? resolveTeamLeaderId(params.input, effectiveParticipants) : null;

  const summary = buildBookingEarningsSummary({
    serviceType: params.serviceId,
    customerTotalCents: params.customerTotalCents,
    eligibleAmountCents: params.eligibleCents,
    isTeamJob: params.isTeamJob,
    teamId: params.input.teamId,
    teamLeaderId,
    participantCleanerIds: effectiveParticipants,
    rosterRoles: params.input.rosterRoles,
    perCleanerBaseCents: params.perCleanerBase,
    adjustments: params.input.adjustments,
    tenureMonths: params.fixedService && !params.isTeamJob ? null : params.tenureMonths,
    cleanerPercentage: params.percentage,
    fixedServicePayoutApplied: params.fixedService,
    minimumEarningCents: MIN_STANDARD_BASE_PAYOUT_CENTS,
    maximumEarningCents: MAX_STANDARD_BASE_PAYOUT_CENTS,
    costsCents: 0,
    computedAtIso: params.input.computedAtIso,
  });

  const explicitBonusTotal = summary.bonus.total_cents;
  const soloRow = !params.isTeamJob ? summary.per_cleaner_earnings[0] : null;

  const diag: CanonicalPayoutDiagnostics = {
    payout_source: "canonical",
    booking_id: params.input.bookingId ?? null,
    service_id: params.serviceId,
    tenure_months: params.tenureMonths,
    payout_percentage: params.percentage,
    fixed_service_override: params.fixedService,
    payout_before_clamp_cents: params.rawBeforeClamp,
    payout_after_clamp_cents: params.rawAfterClamp,
    bonus_cents: explicitBonusTotal,
    final_display_cents: params.displayCents,
    is_team_job: params.isTeamJob,
    payout_mode: params.payoutMode,
    team_cleaner_count: params.isTeamJob ? effectiveParticipants.length : undefined,
    booking_total_team_payout_cents: params.isTeamJob ? summary.total_cleaner_earnings_cents : undefined,
    payout_per_cleaner_cents: params.isTeamJob ? params.displayCents : undefined,
    team_leader_payout_cents:
      params.isTeamJob && teamLeaderId
        ? (params.perCleanerBase.get(teamLeaderId) ?? undefined)
        : undefined,
    team_rule_applied: params.isTeamJob,
  };

  const displayCents = soloRow?.total_cents ?? params.displayCents;
  const soloPayoutCents = soloRow?.base_earning_cents ?? params.soloPayoutCents;
  const soloBonusCents = soloRow?.bonus_cents ?? params.soloBonusCents;

  return {
    displayEarningsCents: displayCents,
    payoutEarningsCents: displayCents,
    internalEarningsCents: summary.total_cleaner_earnings_cents,
    cleanerPayoutCents: params.isTeamJob ? 0 : soloPayoutCents,
    cleanerBonusCents: params.isTeamJob ? 0 : soloBonusCents,
    companyRevenueFromServiceCents: summary.company_revenue_cents,
    payoutPercentage: params.percentage,
    payoutType: params.payoutType,
    tenureMonths: params.tenureMonths,
    fixedServiceOverride: params.fixedService,
    earningsPercentageApplied: params.percentage,
    earningsCapCentsApplied: params.fixedService
      ? TEAM_MEMBER_FIXED_PAYOUT_CENTS
      : MAX_STANDARD_BASE_PAYOUT_CENTS,
    earningsModelVersion: CANONICAL_EARNINGS_MODEL_VERSION,
    diagnostics: diag,
    earningsSummary: summary,
    perCleanerBaseCents: params.perCleanerBase,
  };
}

/**
 * v3 Shalean cleaner earnings rules — solo, team fixed-service (leader uplift), team % parity.
 */
export function resolveCanonicalCleanerPayout(input: CanonicalPayoutInput): CanonicalPayoutResult {
  const serviceId = String(input.serviceId ?? "").trim() || "standard";
  const eligibleCents = Math.max(0, Math.floor(Number(input.bookingValueCents) || 0));
  const fee = Math.max(0, Math.floor(Number(input.serviceFeeCents ?? 0) || 0));
  const customerTotalCents = Math.max(
    0,
    Math.floor(Number(input.customerTotalCents ?? 0) || eligibleCents + fee),
  );
  const sid = serviceId as BookingServiceId | "standard";
  const fixedService = isFixedPayoutSpecialFromNormalizedId(sid);
  const participantIds = resolveParticipantIds(input);
  const teamLeaderId = input.isTeamJob ? resolveTeamLeaderId(input, participantIds) : null;

  if (input.isTeamJob) {
    const realIds = participantIds.filter((id) => !id.startsWith("placeholder-"));
    const effectiveIds =
      realIds.length > 0
        ? realIds
        : Array.from({ length: Math.max(1, Math.floor(Number(input.teamCleanerCount ?? 0) || 0) || 1) }, (_, i) =>
            `placeholder-${i}`,
          );
    const leaderId = resolveTeamLeaderId(input, effectiveIds.filter((id) => !id.startsWith("placeholder-"))) ?? teamLeaderId;
    const perCleanerBase = new Map<string, number>();

    if (fixedService) {
      for (const cid of effectiveIds) {
        if (cid.startsWith("placeholder-")) continue;
        const isLead = leaderId != null && cid === leaderId;
        perCleanerBase.set(cid, isLead ? TEAM_LEADER_FIXED_PAYOUT_CENTS : TEAM_MEMBER_FIXED_PAYOUT_CENTS);
      }
      if (perCleanerBase.size === 0) {
        const count = Math.max(1, effectiveIds.length);
        for (let i = 0; i < count; i++) {
          perCleanerBase.set(`placeholder-${i}`, i === 0 ? TEAM_LEADER_FIXED_PAYOUT_CENTS : TEAM_MEMBER_FIXED_PAYOUT_CENTS);
        }
      }
      const displayCents = TEAM_MEMBER_FIXED_PAYOUT_CENTS;
      return buildResult({
        input,
        serviceId,
        eligibleCents,
        customerTotalCents,
        isTeamJob: true,
        fixedService: true,
        tenureMonths: 0,
        percentage: null,
        perCleanerBase,
        payoutMode: "team_fixed_with_leader",
        payoutType: "team_fixed_with_leader",
        displayCents,
        soloPayoutCents: 0,
        soloBonusCents: 0,
        rawBeforeClamp: null,
        rawAfterClamp: null,
      });
    }

    const leadJoined =
      String(input.teamLeaderJoinedAtIso ?? input.cleanerJoinedAtIso ?? "").trim() || null;
    const tenureMonths = resolveTenureMonths(leadJoined, input.bookingAppointmentIsoUtc);
    const percentage = resolveTenurePercentage(tenureMonths);
    const { rawCents, clampedCents } = computeStandardPercentageEarning(eligibleCents, percentage);

    for (const cid of effectiveIds) {
      if (!cid.startsWith("placeholder-")) {
        perCleanerBase.set(cid, clampedCents);
      }
    }
    if (perCleanerBase.size === 0) {
      const count = Math.max(1, effectiveIds.length);
      for (let i = 0; i < count; i++) {
        perCleanerBase.set(`placeholder-${i}`, clampedCents);
      }
    }

    return buildResult({
      input,
      serviceId,
      eligibleCents,
      customerTotalCents,
      isTeamJob: true,
      fixedService: false,
      tenureMonths,
      percentage,
      perCleanerBase,
      payoutMode: "team_percentage_parity",
      payoutType: "team_percentage_parity",
      displayCents: clampedCents,
      soloPayoutCents: 0,
      soloBonusCents: 0,
      rawBeforeClamp: rawCents,
      rawAfterClamp: clampedCents,
    });
  }

  if (fixedService) {
    const soloId = uuidClean(input.soloCleanerId) || "solo";
    const perCleanerBase = new Map<string, number>([[soloId, FIXED_SPECIAL_PAYOUT_CENTS]]);
    return buildResult({
      input,
      serviceId,
      eligibleCents,
      customerTotalCents,
      isTeamJob: false,
      fixedService: true,
      tenureMonths: 0,
      percentage: null,
      perCleanerBase,
      payoutMode: "solo_fixed_special",
      payoutType: "fixed_special",
      displayCents: FIXED_SPECIAL_PAYOUT_CENTS,
      soloPayoutCents: FIXED_SPECIAL_PAYOUT_CENTS,
      soloBonusCents: 0,
      rawBeforeClamp: FIXED_SPECIAL_PAYOUT_CENTS,
      rawAfterClamp: FIXED_SPECIAL_PAYOUT_CENTS,
    });
  }

  const tenureMonths = resolveTenureMonths(input.cleanerJoinedAtIso, input.bookingAppointmentIsoUtc);
  const percentage = resolveTenurePercentage(tenureMonths);

  if (eligibleCents === 0) {
    const soloId = uuidClean(input.soloCleanerId) || "solo";
    const perCleanerBase = new Map<string, number>([[soloId, 0]]);
    return buildResult({
      input,
      serviceId,
      eligibleCents,
      customerTotalCents,
      isTeamJob: false,
      fixedService: false,
      tenureMonths,
      percentage,
      perCleanerBase,
      payoutMode: "solo_percentage",
      payoutType: "percentage",
      displayCents: 0,
      soloPayoutCents: 0,
      soloBonusCents: 0,
      rawBeforeClamp: 0,
      rawAfterClamp: 0,
    });
  }

  const { rawCents, clampedCents } = computeStandardPercentageEarning(eligibleCents, percentage);
  const soloPayout = Math.min(clampedCents, eligibleCents);
  const soloId = uuidClean(input.soloCleanerId) || "solo";
  const perCleanerBase = new Map<string, number>([[soloId, soloPayout]]);

  return buildResult({
    input,
    serviceId,
    eligibleCents,
    customerTotalCents,
    isTeamJob: false,
    fixedService: false,
    tenureMonths,
    percentage,
    perCleanerBase,
    payoutMode: "solo_percentage",
    payoutType: "percentage",
    displayCents: soloPayout,
    soloPayoutCents: soloPayout,
    soloBonusCents: 0,
    rawBeforeClamp: rawCents,
    rawAfterClamp: soloPayout,
  });
}
