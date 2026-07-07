import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  bookingAppointmentIsoUtc,
  normalizeBookingServiceIdForPayout,
  resolveCanonicalCleanerPayout,
  type CanonicalEarningsAdjustment,
  type CanonicalPayoutResult,
} from "@/lib/payout/canonicalCleanerPayout";
import {
  resolvePayoutBaseAndServiceFeeCents,
  resolveTotalPaidCents,
} from "@/lib/payout/calculateCleanerPayout";
import {
  fetchActiveTeamMemberIdsAtAppointment,
  fetchActiveTeamMemberIdsForMembershipDate,
  resolveTeamPayoutParticipantIds,
} from "@/lib/payout/teamRosterPayoutAllocation";
import { effectiveTeamMembershipDateYmd } from "@/lib/cleaner/teamMemberAvailability";
import {
  buildPairedRosterCanonicalInput,
  isPairedRosterSoloJob,
  loadBookingRosterRows,
  resolvePairedRosterCanonicalPayout,
  resolvePairedRosterLeaderId,
} from "@/lib/payout/pairedRosterPayout";

export type BookingRowForCanonicalPayout = {
  id?: string | null;
  is_team_job?: boolean | null;
  team_id?: string | null;
  payout_owner_cleaner_id?: string | null;
  cleaner_id?: string | null;
  base_amount_cents?: number | null;
  service_fee_cents?: number | null;
  total_paid_zar?: number | null;
  total_paid_cents?: number | null;
  amount_paid_cents?: number | null;
  service?: string | null;
  booking_snapshot?: unknown;
  date?: string | null;
  time?: string | null;
  assigned_at?: string | null;
  price_snapshot?: unknown;
};

async function loadAdjustments(
  admin: SupabaseClient,
  bookingId: string,
): Promise<CanonicalEarningsAdjustment[]> {
  const { data, error } = await admin
    .from("cleaner_earnings_adjustments")
    .select("cleaner_id, amount_cents, reason")
    .eq("booking_id", bookingId);
  if (error || !data?.length) return [];
  return (data as Array<{ cleaner_id?: string; amount_cents?: number; reason?: string | null }>)
    .map((row) => ({
      cleaner_id: String(row.cleaner_id ?? "").trim(),
      amount_cents: Math.floor(Number(row.amount_cents) || 0),
      reason: row.reason ?? undefined,
      type: Math.floor(Number(row.amount_cents) || 0) >= 0 ? "admin_adjustment" : "deduction",
    }))
    .filter((a) => a.cleaner_id && a.amount_cents !== 0);
}

async function loadCleanerJoinedAt(
  admin: SupabaseClient,
  cleanerId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("cleaners")
    .select("joined_at, created_at")
    .eq("id", cleanerId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { joined_at?: string | null; created_at?: string | null };
  return String(row.joined_at ?? row.created_at ?? "").trim() || null;
}

/**
 * Full v3 canonical payout for a booking row (solo or team), including roster + adjustments.
 */
export async function resolveBookingCanonicalPayout(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    row: BookingRowForCanonicalPayout;
    /** Solo job or team member preview target. */
    expectedCleanerId?: string | null;
    eligibleAmountCents?: number;
    computedAtIso?: string;
  },
): Promise<CanonicalPayoutResult> {
  const bookingId = params.bookingId.trim();
  const r = params.row;
  const isTeamJob = r.is_team_job === true;

  const { payoutBaseCents, serviceFeeCents } = resolvePayoutBaseAndServiceFeeCents({
    baseAmountCents: r.base_amount_cents,
    serviceFeeCents: r.service_fee_cents,
    totalPaidZar: r.total_paid_zar,
    amountPaidCents: r.total_paid_cents ?? r.amount_paid_cents,
    priceSnapshot: r.price_snapshot,
  });
  const eligibleAmountCents = Math.max(
    0,
    Math.floor(Number(params.eligibleAmountCents ?? payoutBaseCents) || 0),
  );
  const customerTotalCents = resolveTotalPaidCents(r.total_paid_zar, r.total_paid_cents ?? r.amount_paid_cents);
  const customerTotal =
    customerTotalCents > 0 ? customerTotalCents : Math.max(0, eligibleAmountCents + serviceFeeCents);

  const serviceId = normalizeBookingServiceIdForPayout(r.booking_snapshot ?? null, r.service ?? null);
  const apptIso = bookingAppointmentIsoUtc(r.date, r.time);
  const adjustments = await loadAdjustments(admin, bookingId);

  if (!isTeamJob) {
    const rosterRows = await loadBookingRosterRows(admin, bookingId);
    if (isPairedRosterSoloJob({ isTeamJob: false, rosterRows })) {
      const participantIds = resolveTeamPayoutParticipantIds({
        rosterRows,
        activeTeamMemberIds: [],
      });
      const teamLeaderId = resolvePairedRosterLeaderId({
        rosterRows,
        participantIds,
        payoutOwnerCleanerId: r.payout_owner_cleaner_id,
        bookingCleanerId: r.cleaner_id,
      });
      const leadJoinedAt = teamLeaderId ? await loadCleanerJoinedAt(admin, teamLeaderId) : null;

      return resolvePairedRosterCanonicalPayout(
        buildPairedRosterCanonicalInput({
          bookingId,
          serviceId,
          serviceLabel: r.service ?? null,
          bookingAppointmentIsoUtc: apptIso,
          bookingValueCents: eligibleAmountCents,
          customerTotalCents: customerTotal,
          serviceFeeCents,
          rosterRows,
          participantIds,
          teamLeaderId,
          teamLeaderJoinedAtIso: leadJoinedAt,
          adjustments,
          computedAtIso: params.computedAtIso,
        }),
      );
    }

    const soloCleanerId =
      String(params.expectedCleanerId ?? r.cleaner_id ?? r.payout_owner_cleaner_id ?? "").trim() || null;
    const joinedAt = soloCleanerId ? await loadCleanerJoinedAt(admin, soloCleanerId) : null;

    return resolveCanonicalCleanerPayout({
      bookingId,
      serviceId,
      serviceLabel: r.service ?? null,
      cleanerJoinedAtIso: joinedAt,
      bookingAppointmentIsoUtc: apptIso,
      bookingValueCents: eligibleAmountCents,
      customerTotalCents: customerTotal,
      isTeamJob: false,
      serviceFeeCents,
      adjustments,
      soloCleanerId,
      computedAtIso: params.computedAtIso,
    });
  }

  const teamId = String(r.team_id ?? "").trim();
  const { data: rosterRows } = await admin
    .from("booking_cleaners")
    .select("cleaner_id, role, payout_weight, lead_bonus_cents")
    .eq("booking_id", bookingId)
    .order("cleaner_id", { ascending: true });

  const membershipDateYmd = effectiveTeamMembershipDateYmd(r.date, r.assigned_at);
  const activeTeamMemberIds =
    teamId && membershipDateYmd
      ? await fetchActiveTeamMemberIdsForMembershipDate(admin, teamId, membershipDateYmd)
      : teamId && apptIso
        ? await fetchActiveTeamMemberIdsAtAppointment(admin, teamId, apptIso)
        : [];
  const participantIds = resolveTeamPayoutParticipantIds({
    rosterRows: rosterRows ?? [],
    activeTeamMemberIds,
  });

  const teamLeaderFromRoster = (rosterRows ?? []).find(
    (row) => String((row as { role?: string }).role ?? "").toLowerCase() === "lead",
  ) as { cleaner_id?: string } | undefined;
  const teamLeaderId =
    String(r.payout_owner_cleaner_id ?? "").trim() ||
    String(teamLeaderFromRoster?.cleaner_id ?? "").trim() ||
    participantIds[0] ||
    null;

  const leadJoinedAt = teamLeaderId ? await loadCleanerJoinedAt(admin, teamLeaderId) : null;

  return resolveCanonicalCleanerPayout({
    bookingId,
    serviceId,
    serviceLabel: r.service ?? null,
    cleanerJoinedAtIso: leadJoinedAt,
    teamLeaderJoinedAtIso: leadJoinedAt,
    bookingAppointmentIsoUtc: apptIso,
    bookingValueCents: eligibleAmountCents,
    customerTotalCents: customerTotal,
    isTeamJob: true,
    teamId,
    teamLeaderId,
    participantCleanerIds: participantIds,
    rosterRoles: (rosterRows ?? []).map((row) => ({
      cleaner_id: String((row as { cleaner_id?: string }).cleaner_id ?? ""),
      role: (row as { role?: string | null }).role ?? null,
    })),
    teamCleanerCount: participantIds.length,
    serviceFeeCents,
    adjustments,
    computedAtIso: params.computedAtIso,
  });
}

export function perCleanerTotalFromCanonical(
  result: CanonicalPayoutResult,
  cleanerId: string,
): number | null {
  const summary = result.earningsSummary;
  if (summary) {
    const row = summary.per_cleaner_earnings.find((r) => r.cleaner_id === cleanerId);
    if (row) return row.total_cents;
  }
  const base = result.perCleanerBaseCents.get(cleanerId);
  if (base != null) return base;
  return result.displayEarningsCents;
}
