import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveTeamPayoutOwnerCleanerId } from "@/lib/dispatch/resolveTeamPayoutOwnerCleanerId";
import {
  isTeamMemberActiveOnBookingDate,
  type TeamMemberAvailabilityRow,
} from "@/lib/cleaner/teamMemberAvailability";

export type ReassignPayoutOwnerBeforeTeamMemberRemoveResult =
  | { ok: true; reassigned: number }
  | { ok: false; httpStatus: number; error: string };

function activeCleanerIdsOnDate(members: TeamMemberAvailabilityRow[], dateYmd: string): string[] {
  return [
    ...new Set(
      members
        .filter((m) => {
          const id = String(m.cleaner_id ?? "").trim();
          return id.length > 0 && isTeamMemberActiveOnBookingDate(m, dateYmd);
        })
        .map((m) => String(m.cleaner_id).trim()),
    ),
  ].sort();
}

function resolveReplacementPayoutOwner(
  dateYmd: string,
  remainingMembers: TeamMemberAvailabilityRow[],
  teamLeadCleanerId: string | null,
): string | null {
  const activeOnDate = activeCleanerIdsOnDate(remainingMembers, dateYmd);
  if (activeOnDate.length === 0) return null;
  const lead =
    teamLeadCleanerId && activeOnDate.includes(teamLeadCleanerId) ? teamLeadCleanerId : null;
  return resolveTeamPayoutOwnerCleanerId({
    teamLeadCleanerId: lead,
    activeCleanerIdsSorted: activeOnDate,
    cleanerPassesGate: () => true,
    allowFallback: true,
  });
}

/**
 * Open team jobs still pointing at a roster member being removed get a new payout owner
 * from the remaining roster. Finalized jobs are left unchanged (historical payout owner).
 */
export async function reassignPayoutOwnerBeforeTeamMemberRemove(
  admin: SupabaseClient,
  params: { teamId: string; cleanerId: string },
): Promise<ReassignPayoutOwnerBeforeTeamMemberRemoveResult> {
  const teamId = String(params.teamId ?? "").trim();
  const cleanerId = String(params.cleanerId ?? "").trim();
  if (!teamId || !cleanerId) {
    return { ok: false, httpStatus: 400, error: "teamId and cleanerId are required." };
  }

  const [{ data: teamRow, error: teamErr }, { data: memberRows, error: membersErr }, { data: openRows, error: openErr }] =
    await Promise.all([
      admin.from("teams").select("lead_cleaner_id").eq("id", teamId).maybeSingle(),
      admin
        .from("team_members")
        .select("cleaner_id, active_from, active_to")
        .eq("team_id", teamId)
        .neq("cleaner_id", cleanerId),
      admin
        .from("bookings")
        .select("id, date")
        .eq("team_id", teamId)
        .eq("is_team_job", true)
        .eq("payout_owner_cleaner_id", cleanerId)
        .is("cleaner_line_earnings_finalized_at", null),
    ]);

  if (teamErr) return { ok: false, httpStatus: 500, error: teamErr.message };
  if (membersErr) return { ok: false, httpStatus: 500, error: membersErr.message };
  if (openErr) return { ok: false, httpStatus: 500, error: openErr.message };

  const openBookings = (openRows ?? []) as Array<{ id?: string; date?: string | null }>;
  if (openBookings.length === 0) {
    return { ok: true, reassigned: 0 };
  }

  const remainingMembers = (memberRows ?? []) as TeamMemberAvailabilityRow[];
  if (remainingMembers.length === 0) {
    return {
      ok: false,
      httpStatus: 409,
      error:
        "Cannot remove the last team member while they are payout owner on open team bookings. Assign another cleaner to the team first.",
    };
  }

  const appointedLead = String((teamRow as { lead_cleaner_id?: string | null } | null)?.lead_cleaner_id ?? "").trim();
  const teamLeadAfterRemoval = appointedLead && appointedLead !== cleanerId ? appointedLead : null;

  let reassigned = 0;
  for (const row of openBookings) {
    const bookingId = String(row.id ?? "").trim();
    const dateYmd = String(row.date ?? "").trim();
    if (!bookingId || !/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) continue;

    const replacementId = resolveReplacementPayoutOwner(dateYmd, remainingMembers, teamLeadAfterRemoval);
    if (!replacementId) {
      return {
        ok: false,
        httpStatus: 409,
        error: `Cannot remove this cleaner: no remaining roster member is active on ${dateYmd} for an open team booking. Add a replacement or reschedule the job.`,
      };
    }

    const { error: upErr } = await admin
      .from("bookings")
      .update({
        payout_owner_cleaner_id: replacementId,
        cleaner_id: replacementId,
      })
      .eq("id", bookingId)
      .eq("payout_owner_cleaner_id", cleanerId);

    if (upErr) return { ok: false, httpStatus: 500, error: upErr.message };
    reassigned += 1;
  }

  return { ok: true, reassigned };
}
