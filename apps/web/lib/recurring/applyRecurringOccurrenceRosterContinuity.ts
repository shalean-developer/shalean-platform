import "server-only";

import type { ReplaceBookingCleanersRpcRow } from "@/lib/admin/bookingRosterReplacePayload";
import { isAuthoritativeBookingCompleted } from "@/lib/booking/deriveBookingOperationalPhase";
import { fetchLastAssignedRosterForRecurringPlan } from "@/lib/recurring/fetchLastAssignedRosterForRecurringPlan";
import { rosterHasCustomProvenance } from "@/lib/recurring/recurringRosterProvenance";
import { recurringOccurrenceAssignmentIsCommitted } from "@/lib/recurring/resolveRecurringPreferredCleanerId";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Copies the prior visit's multi-cleaner roster onto a generated recurring occurrence.
 * No-op when the plan has no prior multi-cleaner visit or the booking is locked/finalized.
 */
export async function applyRecurringOccurrenceRosterContinuity(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    recurringId: string;
    /** Lead cleaner already resolved for this occurrence (fallback when roster fetch fails). */
    leadCleanerId?: string | null;
    /** Pre-fetched roster (optional — avoids duplicate query when batching). */
    roster?: {
      leadCleanerId: string;
      cleanerCount: number;
      rosterRows: ReplaceBookingCleanersRpcRow[];
    } | null;
  },
): Promise<{
  ok: boolean;
  applied: boolean;
  cleanerCount: number;
  reason?: string;
  leadCleanerId?: string;
  kind?: "custom_existing" | "committed_existing" | "continuity_applied" | "noop" | "locked";
  lifecyclePromoted?: boolean;
  assignmentCommitted?: boolean;
}> {
  const bookingId = params.bookingId.trim();
  const recurringId = params.recurringId.trim();
  if (!bookingId || !recurringId) return { ok: true, applied: false, cleanerCount: 0 };

  const { data: booking, error: loadErr } = await admin
    .from("bookings")
    .select(
      "id, status, completed_at, cleaner_id, cleaner_response_status, accepted_at, en_route_at, started_at, team_id, is_team_job, cleaner_line_earnings_finalized_at, cleaner_count, booking_cleaners(cleaner_id, role, source)",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (loadErr || !booking) {
    return {
      ok: false,
      applied: false,
      cleanerCount: 0,
      reason: loadErr?.message ?? "booking_not_found",
    };
  }

  const row = booking as {
    status?: string | null;
    completed_at?: string | null;
    cleaner_id?: string | null;
    cleaner_response_status?: string | null;
    accepted_at?: string | null;
    en_route_at?: string | null;
    started_at?: string | null;
    team_id?: string | null;
    is_team_job?: boolean | null;
    cleaner_line_earnings_finalized_at?: string | null;
    cleaner_count?: number | null;
    booking_cleaners?: { cleaner_id?: string | null; role?: string | null; source?: string | null }[] | null;
  };

  if (isAuthoritativeBookingCompleted({ status: row.status, completed_at: row.completed_at })) {
    return { ok: true, applied: false, cleanerCount: 0, kind: "locked" };
  }

  if (row.is_team_job === true || row.team_id) {
    return { ok: true, applied: false, cleanerCount: 0, kind: "locked" };
  }
  if (row.cleaner_line_earnings_finalized_at) {
    return { ok: true, applied: false, cleanerCount: 0, kind: "locked" };
  }

  const existingRoster = Array.isArray(row.booking_cleaners) ? row.booking_cleaners : [];
  const customExistingRoster = rosterHasCustomProvenance(existingRoster);
  const committedAssignment = recurringOccurrenceAssignmentIsCommitted(row);

  if (customExistingRoster || (committedAssignment && existingRoster.length > 0)) {
    const leads = existingRoster.filter(
      (member) => String(member.role ?? "").trim().toLowerCase() === "lead",
    );
    const existingLeadId =
      leads.length === 1 ? String(leads[0]?.cleaner_id ?? "").trim() : "";
    if (!existingLeadId) {
      return {
        ok: false,
        applied: false,
        cleanerCount: existingRoster.length,
        reason: "authoritative_recurring_roster_missing_unique_lead",
      };
    }

    const { error: authoritativePatchErr } = await admin
      .from("bookings")
      .update({
        cleaner_id: existingLeadId,
        payout_owner_cleaner_id: existingLeadId,
        cleaner_count: existingRoster.length,
      })
      .eq("id", bookingId);

    if (authoritativePatchErr) {
      return {
        ok: false,
        applied: false,
        cleanerCount: existingRoster.length,
        reason: authoritativePatchErr.message,
      };
    }

    return {
      ok: true,
      applied: true,
      cleanerCount: existingRoster.length,
      leadCleanerId: existingLeadId,
      kind: customExistingRoster ? "custom_existing" : "committed_existing",
      lifecyclePromoted: false,
      assignmentCommitted: committedAssignment,
    };
  }

  if (committedAssignment) {
    const committedLeadId = String(row.cleaner_id ?? "").trim();
    return {
      ok: true,
      applied: false,
      cleanerCount: Number(row.cleaner_count ?? 1) || 1,
      ...(committedLeadId ? { leadCleanerId: committedLeadId } : {}),
      ...(!committedLeadId
        ? { reason: "committed_recurring_identity_requires_manual_reconciliation" }
        : {}),
      kind: "committed_existing",
      lifecyclePromoted: false,
      assignmentCommitted: true,
    };
  }

  let continuity = params.roster ?? null;
  if (!continuity) {
    try {
      continuity = await fetchLastAssignedRosterForRecurringPlan(admin, recurringId);
    } catch (error) {
      return {
        ok: false,
        applied: false,
        cleanerCount: 0,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }
  if (!continuity || continuity.rosterRows.length < 2) {
    return {
      ok: true,
      applied: false,
      cleanerCount: Number(row.cleaner_count ?? 1) || 1,
      kind: "noop",
      lifecyclePromoted: false,
      assignmentCommitted: false,
    };
  }

  const requestedLeadId = params.leadCleanerId?.trim() || null;
  const leadId = requestedLeadId || continuity.leadCleanerId || null;
  if (!leadId) return { ok: true, applied: false, cleanerCount: 0 };

  let rosterRows = continuity.rosterRows.map((member) => ({
    ...member,
    source: "recurring_continuity",
  }));
  if (requestedLeadId && requestedLeadId !== continuity.leadCleanerId) {
    const existingRequestedLead = rosterRows.find(
      (member) => member.cleaner_id === requestedLeadId,
    );
    const originalLead = rosterRows.find((member) => member.role === "lead");
    if (existingRequestedLead) {
      const transferredLeadBonus = originalLead?.lead_bonus_cents ?? 0;
      rosterRows = rosterRows.map((member) => ({
        ...member,
        role: member.cleaner_id === requestedLeadId ? "lead" : "member",
        lead_bonus_cents:
          member.cleaner_id === requestedLeadId ? transferredLeadBonus : 0,
      }));
    } else if (originalLead) {
      rosterRows = rosterRows.map((member) =>
        member.role === "lead"
          ? { ...member, cleaner_id: requestedLeadId }
          : member,
      );
    }
  }

  const existingRoleByCleanerId = new Map(
    existingRoster
      .map((member) => [
        String(member.cleaner_id ?? "").trim(),
        String(member.role ?? "").trim().toLowerCase(),
      ] as const)
      .filter(([cleanerId]) => Boolean(cleanerId)),
  );
  const desiredRoleByCleanerId = new Map(
    rosterRows.map((member) => [
      member.cleaner_id,
      String(member.role ?? "").trim().toLowerCase(),
    ] as const),
  );
  const rosterAlreadyMatches =
    existingRoster.length >= 2 &&
    existingRoleByCleanerId.size === desiredRoleByCleanerId.size &&
    [...desiredRoleByCleanerId.entries()].every(
      ([cleanerId, role]) => existingRoleByCleanerId.get(cleanerId) === role,
    ) &&
    desiredRoleByCleanerId.get(leadId) === "lead";
  const shouldReplaceRoster = !rosterAlreadyMatches;

  if (shouldReplaceRoster) {
    const { error: rpcErr } = await admin.rpc("replace_booking_cleaners_admin_atomic", {
      p_booking_id: bookingId,
      p_rows: rosterRows,
    });
    if (rpcErr) {
      return {
        ok: false,
        applied: false,
        cleanerCount: 0,
        reason: rpcErr.message,
      };
    }
  }

  const bookingPatch = {
    cleaner_id: leadId,
    payout_owner_cleaner_id: leadId,
    cleaner_mode: "individual_cleaners",
    cleaner_count: rosterRows.length,
    is_team_job: false,
    team_id: null,
    ...(shouldReplaceRoster
      ? {
          assigned_at: new Date().toISOString(),
          cleaner_response_status: "pending",
          dispatch_status: "assigned",
          status: "assigned",
        }
      : {}),
  };

  const { error: patchErr } = await admin
    .from("bookings")
    .update(bookingPatch)
    .eq("id", bookingId);

  if (patchErr) {
    return {
      ok: false,
      applied: false,
      cleanerCount: 0,
      reason: patchErr.message,
    };
  }

  return {
    ok: true,
    applied: true,
    cleanerCount: rosterRows.length,
    leadCleanerId: leadId,
    kind: "continuity_applied",
    lifecyclePromoted: shouldReplaceRoster,
    assignmentCommitted: false,
  };
}
