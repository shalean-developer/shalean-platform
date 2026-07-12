import type { SupabaseClient } from "@supabase/supabase-js";
import { assignAdminTeamAndSyncRoster } from "@/lib/booking/teamAssignmentBookingStateCommands";
import { triggerAssignmentEarningsSnapshotForBooking } from "@/lib/admin/triggerAssignmentEarningsSnapshot";
import { loadCleanerCapabilityColumnsById } from "@/lib/booking/cleanerServiceCapabilityDb";
import {
  activeRosterHasServiceQualifiedMember,
  cleanerPassesServiceCapabilityGate,
  countCleanersPassingServiceCapabilityGate,
  serviceCapabilityGateFromTeamServiceType,
} from "@/lib/booking/serviceCapabilityEligibility";
import type { TeamMemberAvailabilityRow } from "@/lib/cleaner/teamMemberAvailability";
import { isTeamMemberActiveOnBookingDate, effectiveTeamMembershipDateYmd } from "@/lib/cleaner/teamMemberAvailability";
import { isTeamService, teamServiceType } from "@/lib/dispatch/assignBooking";
import { isDispatchTeamPoolServiceType } from "@/lib/dispatch/teamServiceTypeDb";
import { CAPACITY_STATUSES } from "@/lib/dispatch/assignTeamToBooking";
import { assertBookingCleanerEarningsResetSafe } from "@/lib/admin/adminBookingEarningsResetSafety";
import {
  BOOKING_ROSTER_LOCKED_HINT,
  ROSTER_FINALIZED_CODE,
} from "@/lib/admin/bookingRosterLockedMessage";
import {
  findIndividualCleanerSlotConflict,
  findTeamJobSlotConflict,
  formatTeamAssignmentSlotConflictError,
} from "@/lib/admin/teamAssignmentSlotConflicts";
import {
  countPlatformTeamJobsOnDate,
  fetchTeamCapacityUsageSlotsByTeam,
  MAX_TEAM_BOOKINGS_PER_DAY,
  TEAM_MIN_ROSTER_MEMBERS,
  teamJobSlotsPerTeamPerDay,
} from "@/lib/dispatch/teamJobsPerDay";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { CANONICAL_TEAM_POOL_DISPLAY_CENTS, isLegacyPayoutEngineEnabled } from "@/lib/payout/canonicalCleanerPayout";
import { resetBookingCleanerLineEarnings } from "@/lib/payout/resetBookingCleanerLineEarnings";
import {
  buildTeamJobMemberFixedPerCleanerPayoutRows,
  buildTeamJobMemberPayoutInsertRows,
  buildTeamJobMemberPayoutRowsFromEarningsSummary,
  resolveTeamCleanerPoolCents,
} from "@/lib/payout/teamRosterPayoutAllocation";
import { resolveTeamPayoutOwnerCleanerId } from "@/lib/dispatch/resolveTeamPayoutOwnerCleanerId";
import { resolveBookingCanonicalPayout } from "@/lib/payout/resolveBookingCanonicalPayout";

type BookingRow = {
  id: string;
  date: string | null;
  time: string | null;
  service: string | null;
  service_slug?: string | null;
  booking_snapshot?: unknown;
  team_id: string | null;
  is_team_job: boolean | null;
  status: string | null;
  cleaner_line_earnings_finalized_at?: string | null;
};

function teamDayJobSlots(): number {
  return teamJobSlotsPerTeamPerDay();
}

function earningsFinalizedAt(raw: unknown): boolean {
  return raw != null && String(raw).trim() !== "";
}

async function releaseTeamCapacityClaim(
  admin: SupabaseClient,
  teamId: string,
  dateYmd: string,
): Promise<void> {
  await admin.rpc("release_team_capacity_slot", { p_team_id: teamId, p_booking_date: dateYmd });
}

export async function countTeamJobSlotsUsedOnDate(
  admin: SupabaseClient,
  teamId: string,
  dateYmd: string,
  excludeBookingId?: string,
): Promise<{ count: number; error: string | null }> {
  let q = admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId)
    .eq("date", dateYmd)
    .eq("is_team_job", true)
    .in("status", [...CAPACITY_STATUSES]);
  if (excludeBookingId) {
    q = q.neq("id", excludeBookingId);
  }
  const { count, error } = await q;
  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0, error: null };
}

export type AdminAssignTeamOptions = {
  admin: SupabaseClient;
  bookingId: string;
  teamId: string;
  adminUserId: string;
  adminEmail?: string | null;
  /**
   * When true and line earnings are finalized: reopen earnings (if safe) then fully
   * sync team + roster + payouts. Without force, empty-roster locked bookings are blocked.
   */
  force?: boolean;
};

export type AdminAssignTeamResult =
  | { ok: true; teamId: string; oldTeamId: string | null; forceReopenedEarnings?: boolean }
  | { ok: false; httpStatus: number; error: string; code?: string };

export async function performAdminAssignTeam(opts: AdminAssignTeamOptions): Promise<AdminAssignTeamResult> {
  const { admin, bookingId, teamId, adminUserId, adminEmail, force = false } = opts;
  const tid = String(teamId ?? "").trim();
  if (!tid || !/^[0-9a-f-]{36}$/i.test(tid)) {
    return { ok: false, httpStatus: 400, error: "Invalid teamId." };
  }

  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .select(
      "id, date, time, service, booking_snapshot, team_id, is_team_job, status, cleaner_line_earnings_finalized_at",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (bErr) return { ok: false, httpStatus: 500, error: bErr.message };
  if (!booking) return { ok: false, httpStatus: 404, error: "Booking not found." };

  const b = booking as BookingRow;
  const stBooking = String(b.status ?? "").toLowerCase();
  if (stBooking === "pending_payment" || stBooking === "payment_expired") {
    return {
      ok: false,
      httpStatus: 400,
      error: "Awaiting customer payment — assign a team after the customer has paid.",
    };
  }
  if (!isTeamService(b)) {
    return { ok: false, httpStatus: 400, error: "Booking service is not team-based (deep / move)." };
  }

  const expectedService = teamServiceType(b);
  const { data: team, error: tErr } = await admin
    .from("teams")
    .select("id, name, service_type, capacity_per_day, is_active, lead_cleaner_id")
    .eq("id", tid)
    .maybeSingle();
  if (tErr) return { ok: false, httpStatus: 500, error: tErr.message };
  if (!team || !(team as { is_active?: boolean }).is_active) {
    return { ok: false, httpStatus: 400, error: "Team not found or inactive." };
  }
  if (!isDispatchTeamPoolServiceType(String((team as { service_type?: string }).service_type ?? ""))) {
    return {
      ok: false,
      httpStatus: 400,
      error: "Team must be a deep or move dispatch team (Admin → Teams).",
    };
  }

  const dateYmd = String(b.date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
    return { ok: false, httpStatus: 400, error: "Booking date is required for team assignment." };
  }

  const timeHm = String(b.time ?? "").trim();
  if (!/^\d{2}:\d{2}$/.test(timeHm)) {
    return { ok: false, httpStatus: 400, error: "Booking time is required for team assignment." };
  }

  const { data: memberRows, error: mErr } = await admin
    .from("team_members")
    .select("cleaner_id, active_from, active_to")
    .eq("team_id", tid)
    .not("cleaner_id", "is", null);
  if (mErr) return { ok: false, httpStatus: 500, error: mErr.message };

  const membershipDateYmd = effectiveTeamMembershipDateYmd(dateYmd, new Date().toISOString());
  const activeCleanerIds = [
    ...new Set(
      (memberRows ?? [])
        .filter((row) => {
          const r = row as TeamMemberAvailabilityRow;
          return (
            Boolean(r.cleaner_id && String(r.cleaner_id).trim()) &&
            isTeamMemberActiveOnBookingDate(r, membershipDateYmd)
          );
        })
        .map((row) => String((row as { cleaner_id: string }).cleaner_id).trim()),
    ),
  ].sort();

  const rosterCount = activeCleanerIds.length;
  if (rosterCount < TEAM_MIN_ROSTER_MEMBERS) {
    return {
      ok: false,
      httpStatus: 400,
      error: `Team needs at least ${TEAM_MIN_ROSTER_MEMBERS} active members on the visit or assignment date.`,
    };
  }

  const capGate = serviceCapabilityGateFromTeamServiceType(expectedService);
  const capsLoaded = await loadCleanerCapabilityColumnsById(admin, activeCleanerIds);
  if (!capsLoaded.ok) {
    return { ok: false, httpStatus: 500, error: capsLoaded.error };
  }
  if (!activeRosterHasServiceQualifiedMember(activeCleanerIds, capsLoaded.map, capGate)) {
    return {
      ok: false,
      httpStatus: 400,
      error:
        "Team has no member certified for this service on the booking date. Enable `can_do_deep_cleaning` / `can_do_move_cleaning` on at least one active roster cleaner.",
    };
  }

  const cap = teamDayJobSlots();
  const excludeFromPlatform = b.is_team_job === true ? bookingId : undefined;
  const { count: platformUsedExcl, error: platformErr } = await countPlatformTeamJobsOnDate(
    admin,
    dateYmd,
    excludeFromPlatform,
  );
  if (platformErr) return { ok: false, httpStatus: 500, error: platformErr };
  if (platformUsedExcl >= MAX_TEAM_BOOKINGS_PER_DAY) {
    return {
      ok: false,
      httpStatus: 409,
      error: `Daily team booking limit reached (${MAX_TEAM_BOOKINGS_PER_DAY} per day across all teams).`,
    };
  }

  const { count: usedExcludingThis, error: slotErr } = await countTeamJobSlotsUsedOnDate(admin, tid, dateYmd, bookingId);
  if (slotErr) return { ok: false, httpStatus: 500, error: slotErr };
  const usageLoaded = await fetchTeamCapacityUsageSlotsByTeam(admin, dateYmd, [tid]);
  if (usageLoaded.error) return { ok: false, httpStatus: 500, error: usageLoaded.error };
  const usageUsed = usageLoaded.map.get(tid) ?? 0;
  const effectiveUsed = Math.max(usedExcludingThis, usageUsed);
  if (effectiveUsed >= cap) {
    return { ok: false, httpStatus: 409, error: "Team is at capacity for this booking date." };
  }

  const oldTeamId = typeof b.team_id === "string" && b.team_id.trim() ? b.team_id.trim() : null;
  const sameTeam = oldTeamId === tid && b.is_team_job === true;
  let rosterLocked = earningsFinalizedAt(b.cleaner_line_earnings_finalized_at);
  let forceReopenedEarnings = false;

  const oldTeamCapacity = teamDayJobSlots();
  let claimedTeamId: string | null = null;

  if (!sameTeam) {
    if (oldTeamId && oldTeamId !== tid) {
      const { error: relErr } = await admin.rpc("release_team_capacity_slot", {
        p_team_id: oldTeamId,
        p_booking_date: dateYmd,
      });
      if (relErr) {
        return { ok: false, httpStatus: 500, error: `Could not release prior team capacity: ${relErr.message}` };
      }
    }

    const needsClaim = !oldTeamId || oldTeamId !== tid;
    if (needsClaim) {
      const { data: claimed, error: claimErr } = await admin.rpc("claim_team_capacity_slot", {
        p_team_id: tid,
        p_booking_date: dateYmd,
        p_capacity_per_day: cap,
      });
      if (claimErr) {
        if (oldTeamId && oldTeamId !== tid) {
          await admin.rpc("claim_team_capacity_slot", {
            p_team_id: oldTeamId,
            p_booking_date: dateYmd,
            p_capacity_per_day: oldTeamCapacity,
          });
        }
        return { ok: false, httpStatus: 500, error: claimErr.message };
      }
      if (claimed !== true) {
        if (oldTeamId && oldTeamId !== tid) {
          await admin.rpc("claim_team_capacity_slot", {
            p_team_id: oldTeamId,
            p_booking_date: dateYmd,
            p_capacity_per_day: oldTeamCapacity,
          });
        }
        return { ok: false, httpStatus: 409, error: "Team at capacity (claim rejected)." };
      }
      claimedTeamId = tid;
    }
  }

  const teamLeadId = String((team as { lead_cleaner_id?: string | null }).lead_cleaner_id ?? "").trim() || null;
  const payoutOwnerCleanerId = resolveTeamPayoutOwnerCleanerId({
    teamLeadCleanerId: teamLeadId,
    activeCleanerIdsSorted: activeCleanerIds,
    cleanerPassesGate: (id) => cleanerPassesServiceCapabilityGate(capsLoaded.map.get(id) ?? {}, capGate),
    allowFallback: false,
  });
  if (!payoutOwnerCleanerId) {
    if (claimedTeamId) await releaseTeamCapacityClaim(admin, claimedTeamId, dateYmd);
    return {
      ok: false,
      httpStatus: 400,
      error: teamLeadId
        ? "Appointed team lead is inactive on this date or not certified for this service. Update the team lead in Admin → Teams."
        : "Appoint a team lead in Admin → Teams after adding all cleaners, then assign this team.",
    };
  }

  if (!sameTeam) {
    try {
      const teamSlotConflict = await findTeamJobSlotConflict(admin, {
        teamId: tid,
        dateYmd,
        timeHm,
        excludeBookingId: bookingId,
      });
      if (teamSlotConflict) {
        if (claimedTeamId) await releaseTeamCapacityClaim(admin, claimedTeamId, dateYmd);
        return {
          ok: false,
          httpStatus: 409,
          error: formatTeamAssignmentSlotConflictError({
            kind: "team",
            dateYmd,
            timeHm,
            conflict: teamSlotConflict,
          }),
        };
      }

      const cleanerSlotConflict = await findIndividualCleanerSlotConflict(admin, {
        cleanerId: payoutOwnerCleanerId,
        dateYmd,
        timeHm,
        excludeBookingId: bookingId,
      });
      if (cleanerSlotConflict) {
        if (claimedTeamId) await releaseTeamCapacityClaim(admin, claimedTeamId, dateYmd);
        return {
          ok: false,
          httpStatus: 409,
          error: formatTeamAssignmentSlotConflictError({
            kind: "cleaner",
            dateYmd,
            timeHm,
            conflict: cleanerSlotConflict,
          }),
        };
      }
    } catch (slotErr) {
      if (claimedTeamId) await releaseTeamCapacityClaim(admin, claimedTeamId, dateYmd);
      return {
        ok: false,
        httpStatus: 500,
        error: slotErr instanceof Error ? slotErr.message : "Could not verify assignment slot.",
      };
    }
  }

  const nowIso = new Date().toISOString();

  if (rosterLocked && force) {
    const safe = await assertBookingCleanerEarningsResetSafe(admin, bookingId);
    if (!safe.ok) {
      if (claimedTeamId) await releaseTeamCapacityClaim(admin, claimedTeamId, dateYmd);
      return { ok: false, httpStatus: safe.status, error: safe.error, code: safe.code };
    }
    const rst = await resetBookingCleanerLineEarnings(admin, bookingId);
    if (!rst.ok) {
      if (claimedTeamId) await releaseTeamCapacityClaim(admin, claimedTeamId, dateYmd);
      return { ok: false, httpStatus: 500, error: rst.error, code: "earnings_reset_failed" };
    }
    rosterLocked = false;
    forceReopenedEarnings = true;
  }

  if (rosterLocked) {
    const { count: rosterCountCheck } = await admin
      .from("booking_cleaners")
      .select("cleaner_id", { count: "exact", head: true })
      .eq("booking_id", bookingId);
    if ((rosterCountCheck ?? 0) < 1) {
      if (claimedTeamId) await releaseTeamCapacityClaim(admin, claimedTeamId, dateYmd);
      return {
        ok: false,
        httpStatus: 409,
        error: BOOKING_ROSTER_LOCKED_HINT,
        code: ROSTER_FINALIZED_CODE,
      };
    }

    const st = String(b.status ?? "").toLowerCase();
    const headerPatch: Record<string, unknown> = {
      team_id: tid,
      is_team_job: true,
      cleaner_id: payoutOwnerCleanerId,
      payout_owner_cleaner_id: payoutOwnerCleanerId,
      team_member_count_snapshot: rosterCount,
    };
    if (st === "pending" || st === "pending_assignment" || st === "offered") {
      headerPatch.status = "assigned";
      headerPatch.dispatch_status = "assigned";
      headerPatch.assigned_at = nowIso;
    }
    const { error: headerErr } = await admin.from("bookings").update(headerPatch).eq("id", bookingId);
    if (headerErr) {
      if (claimedTeamId) await releaseTeamCapacityClaim(admin, claimedTeamId, dateYmd);
      return { ok: false, httpStatus: 500, error: headerErr.message };
    }
  } else {
    const atomic = await assignAdminTeamAndSyncRoster({
      admin,
      bookingId,
      teamId: tid,
      payoutOwnerCleanerId,
      teamMemberCountSnapshot: rosterCount,
    });
    if (!atomic.ok) {
      if (claimedTeamId) await releaseTeamCapacityClaim(admin, claimedTeamId, dateYmd);
      const locked = /finalized|roster locked|cleaner line earnings finalized/i.test(atomic.message);
      return {
        ok: false,
        httpStatus: locked ? 409 : 500,
        error: locked ? BOOKING_ROSTER_LOCKED_HINT : atomic.message,
        ...(locked ? { code: ROSTER_FINALIZED_CODE } : {}),
      };
    }
  }

  if (!rosterLocked) {
    const { error: delPayErr } = await admin.from("team_job_member_payouts").delete().eq("booking_id", bookingId);
    if (delPayErr) {
      if (claimedTeamId) await releaseTeamCapacityClaim(admin, claimedTeamId, dateYmd);
      return { ok: false, httpStatus: 500, error: `Failed clearing payouts: ${delPayErr.message}` };
    }

    const { data: rosterRows, error: rosterErr } = await admin
      .from("booking_cleaners")
      .select("cleaner_id, role, payout_weight, lead_bonus_cents")
      .eq("booking_id", bookingId)
      .order("cleaner_id", { ascending: true });
    if (rosterErr) {
      if (claimedTeamId) await releaseTeamCapacityClaim(admin, claimedTeamId, dateYmd);
      return { ok: false, httpStatus: 500, error: `Failed loading roster for payout split: ${rosterErr.message}` };
    }

    let payoutRows: ReturnType<typeof buildTeamJobMemberFixedPerCleanerPayoutRows>;
    if (isLegacyPayoutEngineEnabled()) {
      let poolCents = await resolveTeamCleanerPoolCents(admin, bookingId);
      if (poolCents <= 0) poolCents = CANONICAL_TEAM_POOL_DISPLAY_CENTS;
      payoutRows = buildTeamJobMemberPayoutInsertRows({
        bookingId,
        teamId: tid,
        poolCents,
        rosterRows: rosterRows ?? [],
        fallbackCleanerIds: activeCleanerIds,
      });
    } else {
      const { data: bookingFinancial, error: finErr } = await admin
        .from("bookings")
        .select(
          "id, is_team_job, team_id, payout_owner_cleaner_id, base_amount_cents, service_fee_cents, total_paid_zar, total_paid_cents, amount_paid_cents, service, booking_snapshot, date, time, price_snapshot",
        )
        .eq("id", bookingId)
        .maybeSingle();
      if (finErr || !bookingFinancial) {
        if (claimedTeamId) await releaseTeamCapacityClaim(admin, claimedTeamId, dateYmd);
        return { ok: false, httpStatus: 500, error: `Failed loading booking for payout: ${finErr?.message ?? "not found"}` };
      }
      const canonical = await resolveBookingCanonicalPayout(admin, {
        bookingId,
        row: bookingFinancial,
        expectedCleanerId: payoutOwnerCleanerId,
        computedAtIso: nowIso,
      });
      if (canonical.earningsSummary) {
        payoutRows = buildTeamJobMemberPayoutRowsFromEarningsSummary({
          bookingId,
          teamId: tid,
          summary: canonical.earningsSummary,
        });
        await admin
          .from("bookings")
          .update({
            earnings_summary: canonical.earningsSummary,
            company_revenue_cents: canonical.earningsSummary.company_revenue_cents,
            display_earnings_cents: canonical.displayEarningsCents,
            internal_earnings_cents: canonical.earningsSummary.total_cleaner_earnings_cents,
            earnings_model_version: canonical.earningsModelVersion,
          })
          .eq("id", bookingId);
      } else {
        payoutRows = buildTeamJobMemberFixedPerCleanerPayoutRows({
          bookingId,
          teamId: tid,
          rosterRows: rosterRows ?? [],
          fallbackCleanerIds: activeCleanerIds,
        });
      }
    }
    if (payoutRows.length > 0) {
      const { error: insPayErr } = await admin.from("team_job_member_payouts").insert(payoutRows);
      if (insPayErr) {
        if (claimedTeamId) await releaseTeamCapacityClaim(admin, claimedTeamId, dateYmd);
        return { ok: false, httpStatus: 500, error: `Failed inserting payouts: ${insPayErr.message}` };
      }
    }
  }

  const { error: delAssignErr } = await admin.from("booking_team_assignments").delete().eq("booking_id", bookingId);
  if (delAssignErr) {
    if (claimedTeamId) await releaseTeamCapacityClaim(admin, claimedTeamId, dateYmd);
    return { ok: false, httpStatus: 500, error: `Failed clearing team assignment rows: ${delAssignErr.message}` };
  }

  const { error: insAssignErr } = await admin.from("booking_team_assignments").insert({
    booking_id: bookingId,
    team_id: tid,
    status: "assigned",
    assigned_at: nowIso,
  });
  if (insAssignErr) {
    if (claimedTeamId) await releaseTeamCapacityClaim(admin, claimedTeamId, dateYmd);
    return { ok: false, httpStatus: 500, error: `Failed recording team assignment: ${insAssignErr.message}` };
  }

  void logSystemEvent({
    level: "info",
    source: "ADMIN_TEAM_OVERRIDE",
    message: forceReopenedEarnings
      ? "Admin force-assigned team after reopening finalized line earnings"
      : "Admin manually assigned or changed team for booking",
    context: {
      bookingId,
      oldTeamId: oldTeamId ?? null,
      newTeamId: tid,
      adminId: adminUserId,
      adminEmail: adminEmail ?? null,
      force: force === true,
      forceReopenedEarnings,
    },
  });

  /** M-8: assignment-mutation snapshot trigger (monthly team bookings only). */
  await triggerAssignmentEarningsSnapshotForBooking(admin, bookingId, "performAdminAssignTeam");

  return { ok: true, teamId: tid, oldTeamId, ...(forceReopenedEarnings ? { forceReopenedEarnings: true } : {}) };
}

export type TeamAssignCandidateRow = {
  id: string;
  name: string;
  service_type: string;
  capacity_per_day: number;
  /** Distinct cleaners active on the booking date (membership window). */
  active_member_count: number;
  /** Subset of active cleaners who pass the deep/move capability gate for this booking. */
  qualified_member_count: number;
  /**
   * Same as `qualified_member_count` (assignment-eligible headcount).
   * Kept for older clients that only read `member_count`.
   */
  member_count: number;
  used_slots_today: number;
  remaining_slots_today: number;
  /** False when no qualified active cleaner or no spare day slot for this booking to land on this team. */
  assignable: boolean;
  /** Human-readable reason when `assignable` is false (shown in Office assign-team picker). */
  assign_block_reason: string | null;
  /** False when the team row is inactive — still listed so admins can see and re-enable in Teams admin. */
  team_active: boolean;
};

function teamAssignBlockReason(opts: {
  teamActive: boolean;
  platformAtCapacity: boolean;
  activeCount: number;
  qualifiedCount: number;
  usedExcl: number;
  cap: number;
  qualifiedLabel: string;
}): string | null {
  if (!opts.teamActive) return "Team is paused — activate it in Office → Teams.";
  if (opts.platformAtCapacity) {
    return `Daily team limit reached (${MAX_TEAM_BOOKINGS_PER_DAY} deep/move jobs per day).`;
  }
  if (opts.activeCount < TEAM_MIN_ROSTER_MEMBERS) {
    return `Only ${opts.activeCount} roster member(s) active on this booking date (need ${TEAM_MIN_ROSTER_MEMBERS}). Members count from their join date — use a later visit date or add members earlier.`;
  }
  if (opts.qualifiedCount < 1) {
    return `No roster member qualified for ${opts.qualifiedLabel} on this date. Enable the capability on at least one active cleaner.`;
  }
  if (opts.usedExcl >= opts.cap) return "Team already has a job scheduled on this date.";
  return null;
}

function activeCleanerIdsSortedOnDate(members: TeamMemberAvailabilityRow[], dateYmd: string): string[] {
  return [
    ...new Set(
      members
        .filter(
          (m) =>
            isTeamMemberActiveOnBookingDate(m, dateYmd) &&
            m.cleaner_id != null &&
            String(m.cleaner_id).trim() !== "",
        )
        .map((m) => String(m.cleaner_id).trim()),
    ),
  ].sort();
}

function teamQualifiedForDisplayLabel(st: "deep_cleaning" | "move_cleaning"): string {
  return st === "move_cleaning" ? "move cleaning" : "deep cleaning";
}

export type ListTeamAssignCandidatesResult = {
  teams: TeamAssignCandidateRow[];
  error: string | null;
  /** Human label for the capability gate (e.g. “move cleaning”) when `teams` is for a team-service booking. */
  qualified_for_label: string;
};

export async function listTeamAssignCandidatesForBooking(
  admin: SupabaseClient,
  booking: Pick<BookingRow, "service" | "booking_snapshot" | "date" | "id" | "service_slug" | "is_team_job">,
): Promise<ListTeamAssignCandidatesResult> {
  if (!isTeamService(booking as BookingRow)) {
    return { teams: [], error: null, qualified_for_label: "" };
  }
  const dateYmd = String(booking.date ?? "").trim();
  const st = teamServiceType(booking as BookingRow);
  const qualifiedLabel = teamQualifiedForDisplayLabel(st);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
    return { teams: [], error: "Booking date invalid.", qualified_for_label: qualifiedLabel };
  }
  const membershipDateYmd = effectiveTeamMembershipDateYmd(dateYmd, new Date().toISOString());
  const capGate = serviceCapabilityGateFromTeamServiceType(st);

  const { data: teamsRaw, error: tErr } = await admin
    .from("teams")
    .select("id, name, service_type, capacity_per_day, is_active")
    .order("name", { ascending: true })
    .limit(250);
  if (tErr) return { teams: [], error: tErr.message, qualified_for_label: qualifiedLabel };

  const teamRows = ((teamsRaw ?? []) as Array<{
    id: string;
    name: string;
    service_type: string;
    capacity_per_day: number;
    is_active?: boolean | null;
  }>).filter((row) => isDispatchTeamPoolServiceType(row.service_type));
  const teamIds = teamRows.map((t) => String(t.id).trim()).filter(Boolean);

  const membersByTeam = new Map<string, TeamMemberAvailabilityRow[]>();
  if (teamIds.length > 0) {
    const { data: allMembers, error: mErr } = await admin
      .from("team_members")
      .select("team_id, cleaner_id, active_from, active_to")
      .in("team_id", teamIds)
      .not("cleaner_id", "is", null);
    if (mErr) return { teams: [], error: mErr.message, qualified_for_label: qualifiedLabel };
    for (const raw of allMembers ?? []) {
      const tid = String((raw as { team_id?: string }).team_id ?? "").trim();
      if (!tid) continue;
      const row = raw as TeamMemberAvailabilityRow;
      const list = membersByTeam.get(tid);
      if (list) list.push(row);
      else membersByTeam.set(tid, [row]);
    }
  }

  const allActiveCleanerIds = new Set<string>();
  for (const arr of membersByTeam.values()) {
    for (const id of activeCleanerIdsSortedOnDate(arr, membershipDateYmd)) {
      allActiveCleanerIds.add(id);
    }
  }
  const capsLoaded = await loadCleanerCapabilityColumnsById(admin, [...allActiveCleanerIds]);
  if (!capsLoaded.ok) return { teams: [], error: capsLoaded.error, qualified_for_label: qualifiedLabel };

  const excludeFromPlatform = (booking as BookingRow).is_team_job === true ? booking.id : undefined;
  const { count: platformUsedExcl, error: platformErr } = await countPlatformTeamJobsOnDate(
    admin,
    dateYmd,
    excludeFromPlatform,
  );
  if (platformErr) return { teams: [], error: platformErr, qualified_for_label: qualifiedLabel };
  const platformAtCapacity = platformUsedExcl >= MAX_TEAM_BOOKINGS_PER_DAY;

  const usageLoaded = await fetchTeamCapacityUsageSlotsByTeam(admin, dateYmd, teamIds);
  if (usageLoaded.error) return { teams: [], error: usageLoaded.error, qualified_for_label: qualifiedLabel };

  const out: TeamAssignCandidateRow[] = [];
  for (const row of teamRows) {
    const members = membersByTeam.get(row.id) ?? [];
    const activeCleanerIds = activeCleanerIdsSortedOnDate(members, membershipDateYmd);
    const activeCount = activeCleanerIds.length;
    const qualifiedCount = countCleanersPassingServiceCapabilityGate(activeCleanerIds, capsLoaded.map, capGate);
    const { count: usedFromBookings } = await countTeamJobSlotsUsedOnDate(admin, row.id, dateYmd);
    const usageUsed = usageLoaded.map.get(row.id) ?? 0;
    const usedFull = Math.max(usedFromBookings, usageUsed);
    const { count: usedExclBookings } = await countTeamJobSlotsUsedOnDate(admin, row.id, dateYmd, booking.id);
    const usedExcl = Math.max(usedExclBookings, usageUsed);
    const cap = teamDayJobSlots();
    const teamActive = row.is_active !== false;
    const assignable =
      teamActive &&
      !platformAtCapacity &&
      activeCount >= TEAM_MIN_ROSTER_MEMBERS &&
      qualifiedCount > 0 &&
      usedExcl < cap;
    const assign_block_reason = assignable
      ? null
      : teamAssignBlockReason({
          teamActive,
          platformAtCapacity,
          activeCount,
          qualifiedCount,
          usedExcl,
          cap,
          qualifiedLabel,
        });
    out.push({
      id: row.id,
      name: row.name,
      service_type: row.service_type,
      capacity_per_day: cap,
      active_member_count: activeCount,
      qualified_member_count: qualifiedCount,
      member_count: qualifiedCount,
      used_slots_today: usedFull,
      remaining_slots_today: Math.max(0, cap - usedFull),
      assignable,
      assign_block_reason,
      team_active: teamActive,
    });
  }
  return { teams: out, error: null, qualified_for_label: qualifiedLabel };
}
