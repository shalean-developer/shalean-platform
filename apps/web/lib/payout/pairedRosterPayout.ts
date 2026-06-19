import "server-only";

import type { BookingServiceId } from "@/components/booking/serviceCategories";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CANONICAL_EARNINGS_MODEL_VERSION,
  isFixedPayoutSpecialFromNormalizedId,
  resolveCanonicalCleanerPayout,
  resolveTenureMonths,
  resolveTenurePercentage,
  TEAM_LEADER_FIXED_PAYOUT_CENTS,
  TEAM_MEMBER_FIXED_PAYOUT_CENTS,
  type CanonicalPayoutInput,
  type CanonicalPayoutResult,
} from "@/lib/payout/canonicalCleanerPayout";
import { buildBookingEarningsSummary, type BookingEarningsSummary } from "@/lib/payout/bookingEarningsSummary";
import {
  resolveTeamPayoutParticipantIds,
  type BookingCleanerRosterRow,
} from "@/lib/payout/teamRosterPayoutAllocation";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** R250 minimum per cleaner on paired roster jobs. */
export const PAIRED_ROSTER_MIN_PAYOUT_CENTS = 25_000;
/** R280 maximum per cleaner on paired roster jobs (solo cap remains R300). */
export const PAIRED_ROSTER_MAX_PAYOUT_CENTS = 28_000;

export type BookingRosterRow = BookingCleanerRosterRow & {
  cleaner_id: string;
};

export function isUuidCleanerId(raw: string | null | undefined): raw is string {
  const t = String(raw ?? "").trim();
  return UUID_RE.test(t);
}

export function clampPairedRosterEarningCents(rawCents: number): number {
  const raw = Math.max(0, Math.round(rawCents));
  return Math.min(PAIRED_ROSTER_MAX_PAYOUT_CENTS, Math.max(PAIRED_ROSTER_MIN_PAYOUT_CENTS, raw));
}

/**
 * Pool-first split: 70% of eligible basis shared equally by headcount, clamped R250–R280 per cleaner.
 * Deep / move / carpet paired jobs use fixed leader/member rates instead (see resolvePairedRosterCanonicalPayout).
 */
export function computePairedRosterPerCleanerBaseCents(params: {
  eligibleCents: number;
  percentage: number;
  participantIds: readonly string[];
}): { perCleanerBase: Map<string, number>; rawPoolCents: number; shareRawCents: number } {
  const headcount = Math.max(1, params.participantIds.length);
  const rawPoolCents = Math.round(Math.max(0, params.eligibleCents) * params.percentage);
  const shareRawCents = headcount > 0 ? rawPoolCents / headcount : rawPoolCents;
  const perPerson = clampPairedRosterEarningCents(shareRawCents);
  const perCleanerBase = new Map<string, number>();
  for (const cid of params.participantIds) {
    perCleanerBase.set(cid, perPerson);
  }
  return { perCleanerBase, rawPoolCents, shareRawCents };
}

function uuidClean(id: string | null | undefined): string {
  const s = String(id ?? "").trim();
  return UUID_RE.test(s) ? s : "";
}

function resolveLeaderId(input: CanonicalPayoutInput, participantIds: readonly string[]): string | null {
  const explicit = uuidClean(input.teamLeaderId);
  if (explicit && participantIds.includes(explicit)) return explicit;
  const fromRoster = input.rosterRoles?.find((r) => String(r.role ?? "").toLowerCase() === "lead");
  const rosterLead = uuidClean(fromRoster?.cleaner_id);
  if (rosterLead && participantIds.includes(rosterLead)) return rosterLead;
  return participantIds[0] ?? null;
}

/** Solo booking with 2+ cleaners on `booking_cleaners` (paired / dual-cleaner job). */
export function isPairedRosterSoloJob(params: {
  isTeamJob?: boolean | null;
  rosterRows: readonly { cleaner_id?: string | null }[];
}): boolean {
  if (params.isTeamJob === true) return false;
  const ids = resolveTeamPayoutParticipantIds({
    rosterRows: params.rosterRows,
    activeTeamMemberIds: [],
  });
  return ids.length >= 2;
}

export function resolvePairedRosterLeaderId(params: {
  rosterRows: readonly BookingRosterRow[];
  participantIds: readonly string[];
  payoutOwnerCleanerId?: string | null;
  bookingCleanerId?: string | null;
}): string | null {
  const fromOwner = String(params.payoutOwnerCleanerId ?? "").trim();
  if (isUuidCleanerId(fromOwner) && params.participantIds.includes(fromOwner)) return fromOwner;

  const fromRoster = params.rosterRows.find((r) => String(r.role ?? "").toLowerCase() === "lead");
  const rosterLead = String(fromRoster?.cleaner_id ?? "").trim();
  if (isUuidCleanerId(rosterLead) && params.participantIds.includes(rosterLead)) return rosterLead;

  const fromBooking = String(params.bookingCleanerId ?? "").trim();
  if (isUuidCleanerId(fromBooking) && params.participantIds.includes(fromBooking)) return fromBooking;

  return params.participantIds[0] ?? null;
}

export function leadEarningsRowFromSummary(
  summary: BookingEarningsSummary | null | undefined,
  leaderId: string | null,
): BookingEarningsSummary["per_cleaner_earnings"][number] | null {
  if (!summary?.per_cleaner_earnings?.length) return null;
  if (leaderId) {
    const byId = summary.per_cleaner_earnings.find((r) => r.cleaner_id === leaderId);
    if (byId) return byId;
  }
  const lead = summary.per_cleaner_earnings.find((r) => r.role === "lead");
  return lead ?? summary.per_cleaner_earnings[0] ?? null;
}

export function rosterMemberRowsFromSummary(
  summary: BookingEarningsSummary,
  leaderId: string | null,
): BookingEarningsSummary["per_cleaner_earnings"] {
  const lid = String(leaderId ?? "").trim();
  return summary.per_cleaner_earnings.filter((row) => {
    const cid = String(row.cleaner_id ?? "").trim();
    if (!cid) return false;
    if (lid && cid === lid) return false;
    if (!lid && row.role === "lead") return false;
    return true;
  });
}

export async function loadBookingRosterRows(
  admin: SupabaseClient,
  bookingId: string,
): Promise<BookingRosterRow[]> {
  const { data, error } = await admin
    .from("booking_cleaners")
    .select("cleaner_id, role, payout_weight, lead_bonus_cents")
    .eq("booking_id", bookingId)
    .order("cleaner_id", { ascending: true });
  if (error) return [];
  return (data ?? [])
    .map((row) => row as BookingRosterRow)
    .filter((row) => isUuidCleanerId(row.cleaner_id));
}

export function buildPairedRosterCanonicalInput(params: {
  bookingId: string;
  serviceId: string;
  serviceLabel?: string | null;
  bookingAppointmentIsoUtc: string | null;
  bookingValueCents: number;
  customerTotalCents: number;
  serviceFeeCents?: number;
  rosterRows: readonly BookingRosterRow[];
  participantIds: readonly string[];
  teamLeaderId: string | null;
  teamLeaderJoinedAtIso: string | null;
  adjustments?: CanonicalPayoutInput["adjustments"];
  computedAtIso?: string;
}): CanonicalPayoutInput {
  return {
    bookingId: params.bookingId,
    serviceId: params.serviceId,
    serviceLabel: params.serviceLabel ?? null,
    cleanerJoinedAtIso: params.teamLeaderJoinedAtIso,
    teamLeaderJoinedAtIso: params.teamLeaderJoinedAtIso,
    bookingAppointmentIsoUtc: params.bookingAppointmentIsoUtc,
    bookingValueCents: params.bookingValueCents,
    customerTotalCents: params.customerTotalCents,
    isTeamJob: true,
    teamLeaderId: params.teamLeaderId,
    participantCleanerIds: [...params.participantIds],
    rosterRoles: params.rosterRows.map((row) => ({
      cleaner_id: row.cleaner_id,
      role: row.role ?? null,
    })),
    teamCleanerCount: params.participantIds.length,
    serviceFeeCents: params.serviceFeeCents,
    adjustments: params.adjustments,
    computedAtIso: params.computedAtIso,
  };
}

/** Paired solo roster: split 70% eligible pool equally (R250–R280 each). */
export function resolvePairedRosterCanonicalPayout(input: CanonicalPayoutInput): CanonicalPayoutResult {
  const serviceId = String(input.serviceId ?? "").trim() || "standard";
  const eligibleCents = Math.max(0, Math.floor(Number(input.bookingValueCents) || 0));
  const fee = Math.max(0, Math.floor(Number(input.serviceFeeCents ?? 0) || 0));
  const customerTotalCents = Math.max(
    0,
    Math.floor(Number(input.customerTotalCents ?? 0) || eligibleCents + fee),
  );
  const fixedService = isFixedPayoutSpecialFromNormalizedId(serviceId as BookingServiceId);
  const participantIds = [
    ...new Set((input.participantCleanerIds ?? []).map((id) => uuidClean(id)).filter(Boolean)),
  ];

  if (participantIds.length < 2) {
    return resolveCanonicalCleanerPayout({
      ...input,
      isTeamJob: false,
      soloCleanerId: participantIds[0] ?? input.soloCleanerId ?? null,
    });
  }

  if (fixedService) {
    const teamLeaderId = resolveLeaderId(input, participantIds);
    const perCleanerBase = new Map<string, number>();
    for (const cid of participantIds) {
      perCleanerBase.set(
        cid,
        teamLeaderId && cid === teamLeaderId ? TEAM_LEADER_FIXED_PAYOUT_CENTS : TEAM_MEMBER_FIXED_PAYOUT_CENTS,
      );
    }
    return buildPairedRosterResult({
      input,
      serviceId,
      eligibleCents,
      customerTotalCents,
      participantIds,
      teamLeaderId,
      perCleanerBase,
      tenureMonths: 0,
      percentage: null,
      payoutType: "team_fixed_with_leader",
      payoutMode: "team_fixed_with_leader",
      displayCents: TEAM_MEMBER_FIXED_PAYOUT_CENTS,
      rawPoolCents: null,
      shareRawCents: null,
      fixedService: true,
    });
  }

  const teamLeaderId = resolveLeaderId(input, participantIds);
  const leadJoined =
    String(input.teamLeaderJoinedAtIso ?? input.cleanerJoinedAtIso ?? "").trim() || null;
  const tenureMonths = resolveTenureMonths(leadJoined, input.bookingAppointmentIsoUtc);
  const percentage = resolveTenurePercentage(tenureMonths);
  const { perCleanerBase, rawPoolCents, shareRawCents } = computePairedRosterPerCleanerBaseCents({
    eligibleCents,
    percentage,
    participantIds,
  });
  const displayCents = clampPairedRosterEarningCents(shareRawCents);

  return buildPairedRosterResult({
    input,
    serviceId,
    eligibleCents,
    customerTotalCents,
    participantIds,
    teamLeaderId,
    perCleanerBase,
    tenureMonths,
    percentage,
    payoutType: "paired_roster_pool_split",
    payoutMode: "paired_roster_pool_split",
    displayCents: displayCents,
    rawPoolCents,
    shareRawCents,
    fixedService: false,
  });
}

function buildPairedRosterResult(params: {
  input: CanonicalPayoutInput;
  serviceId: string;
  eligibleCents: number;
  customerTotalCents: number;
  participantIds: readonly string[];
  teamLeaderId: string | null;
  perCleanerBase: Map<string, number>;
  tenureMonths: number;
  percentage: number | null;
  payoutType: CanonicalPayoutResult["payoutType"];
  payoutMode: NonNullable<CanonicalPayoutResult["diagnostics"]["payout_mode"]>;
  displayCents: number;
  rawPoolCents: number | null;
  shareRawCents: number | null;
  fixedService: boolean;
}): CanonicalPayoutResult {
  const summary = buildBookingEarningsSummary({
    serviceType: params.serviceId,
    customerTotalCents: params.customerTotalCents,
    eligibleAmountCents: params.eligibleCents,
    isTeamJob: true,
    teamId: params.input.teamId,
    teamLeaderId: params.teamLeaderId,
    participantCleanerIds: [...params.participantIds],
    rosterRoles: params.input.rosterRoles,
    perCleanerBaseCents: params.perCleanerBase,
    adjustments: params.input.adjustments,
    tenureMonths: params.fixedService ? null : params.tenureMonths,
    cleanerPercentage: params.percentage,
    fixedServicePayoutApplied: params.fixedService,
    minimumEarningCents: PAIRED_ROSTER_MIN_PAYOUT_CENTS,
    maximumEarningCents: PAIRED_ROSTER_MAX_PAYOUT_CENTS,
    costsCents: 0,
    computedAtIso: params.input.computedAtIso,
  });

  return {
    displayEarningsCents: params.displayCents,
    payoutEarningsCents: params.displayCents,
    internalEarningsCents: summary.total_cleaner_earnings_cents,
    cleanerPayoutCents: 0,
    cleanerBonusCents: 0,
    companyRevenueFromServiceCents: summary.company_revenue_cents,
    payoutPercentage: params.percentage,
    payoutType: params.payoutType,
    tenureMonths: params.tenureMonths,
    fixedServiceOverride: params.fixedService,
    earningsPercentageApplied: params.percentage,
    earningsCapCentsApplied: PAIRED_ROSTER_MAX_PAYOUT_CENTS,
    earningsModelVersion: CANONICAL_EARNINGS_MODEL_VERSION,
    diagnostics: {
      payout_source: "canonical",
      booking_id: params.input.bookingId ?? null,
      service_id: params.serviceId,
      payout_mode: params.payoutMode,
      tenure_months: params.tenureMonths,
      payout_percentage: params.percentage,
      raw_before_clamp_cents: params.rawPoolCents,
      raw_after_clamp_cents: params.shareRawCents != null ? Math.round(params.shareRawCents) : null,
      final_display_cents: params.displayCents,
      is_team_job: true,
      team_cleaner_count: params.participantIds.length,
      booking_total_team_payout_cents: summary.total_cleaner_earnings_cents,
      payout_per_cleaner_cents: params.displayCents,
      team_leader_payout_cents:
        params.teamLeaderId != null ? params.perCleanerBase.get(params.teamLeaderId) ?? null : null,
      team_rule_applied: true,
    },
    earningsSummary: summary,
    perCleanerBaseCents: params.perCleanerBase,
  };
}

export type BookingRosterMemberPayoutInsertRow = {
  booking_id: string;
  cleaner_id: string;
  payout_cents: number;
  bonus_cents: number;
  status: string;
};

export function buildBookingRosterMemberPayoutRows(params: {
  bookingId: string;
  summary: BookingEarningsSummary;
  leaderId: string | null;
}): BookingRosterMemberPayoutInsertRow[] {
  return rosterMemberRowsFromSummary(params.summary, params.leaderId).map((row) => ({
    booking_id: params.bookingId,
    cleaner_id: row.cleaner_id,
    payout_cents: Math.max(0, Math.round(row.base_earning_cents ?? 0)),
    bonus_cents: Math.max(0, Math.round(row.bonus_cents ?? 0)),
    status: "pending",
  }));
}
