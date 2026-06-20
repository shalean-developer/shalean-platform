import { rosterTooltipNames } from "@/lib/admin/adminBookingsListDerived";
import { isTeamService, type TeamBookingServiceRef } from "@/lib/dispatch/teamServiceDetection";

export type AdminBookingAssignmentDisplayInput = TeamBookingServiceRef & {
  team_id?: string | null;
  team?: { id: string; name: string | null } | null;
  booking_cleaners?: readonly { full_name: string | null; role: string; cleaner_id?: string }[] | null;
};

export function teamBookingMissingFormalAssignment(row: AdminBookingAssignmentDisplayInput): boolean {
  if (!isTeamService(row)) return false;
  return !String(row.team_id ?? "").trim();
}

/** List / card assignment column label for admin + office bookings. */
export function adminBookingAssignmentDisplay(row: AdminBookingAssignmentDisplayInput): {
  label: string;
  title?: string;
  needsTeam: boolean;
} {
  const teamName = row.team?.name?.trim();
  if (teamName) return { label: teamName, needsTeam: false };
  if (String(row.team_id ?? "").trim()) return { label: "Team assigned", needsTeam: false };

  const roster = row.booking_cleaners ?? [];
  if (teamBookingMissingFormalAssignment(row)) {
    return {
      label: "Needs team",
      title: roster.length > 0 ? rosterTooltipNames(roster) : undefined,
      needsTeam: true,
    };
  }

  if (roster.length > 0) {
    return {
      label: roster.map((c) => c.full_name ?? "Cleaner").join(", "),
      title: rosterTooltipNames(roster),
      needsTeam: false,
    };
  }

  return { label: "—", needsTeam: false };
}

/** Hide orphan roster rows on deep/move jobs until `team_id` is set (list API + cards). */
export function effectiveBookingCleanersForList<T extends { full_name: string | null; role: string; cleaner_id?: string }>(
  row: AdminBookingAssignmentDisplayInput,
  roster: readonly T[],
): readonly T[] {
  if (teamBookingMissingFormalAssignment(row)) return [];
  return roster;
}

export const TEAM_ROSTER_REQUIRES_ASSIGN_MSG =
  "Deep and move jobs must use Assign team first. Manual roster edits are not allowed until a team is linked on the booking.";

export function teamRosterEditBlockedReason(row: AdminBookingAssignmentDisplayInput): string | null {
  if (teamBookingMissingFormalAssignment(row)) return TEAM_ROSTER_REQUIRES_ASSIGN_MSG;
  return null;
}
