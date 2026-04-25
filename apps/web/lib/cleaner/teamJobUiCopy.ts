/**
 * Primary line for team-assigned bookings in cleaner UI.
 * When backed by DB snapshot, count is roster size at assignment time, not live membership.
 */
export function teamJobAssignmentHeadline(teamMemberCount: number | null | undefined): string {
  const n = typeof teamMemberCount === "number" && Number.isFinite(teamMemberCount) ? Math.max(0, Math.floor(teamMemberCount)) : null;
  if (n != null && n > 0) {
    const label = n === 1 ? "cleaner" : "cleaners";
    return `👥 Assigned to your team (${n} ${label})`;
  }
  return "👥 Assigned to your team";
}

/** Secondary reassurance line (no lead role until product stores it). */
export const TEAM_JOB_ROLE_SUBTEXT = "You are part of this job.";
