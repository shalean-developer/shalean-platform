/**
 * Resolve payout owner / team lead for assignment.
 * Prefers admin-appointed `teams.lead_cleaner_id` when active and capability-qualified.
 */

export function resolveTeamPayoutOwnerCleanerId(params: {
  teamLeadCleanerId?: string | null;
  activeCleanerIdsSorted: readonly string[];
  cleanerPassesGate: (cleanerId: string) => boolean;
  /**
   * When false (admin assign), returns null if no valid appointed lead — admin must set team lead first.
   * When true (dispatch), falls back to first capability-qualified active member.
   */
  allowFallback?: boolean;
}): string | null {
  const appointed = String(params.teamLeadCleanerId ?? "").trim();
  if (
    appointed &&
    params.activeCleanerIdsSorted.includes(appointed) &&
    params.cleanerPassesGate(appointed)
  ) {
    return appointed;
  }
  if (params.allowFallback === false) return null;
  return params.activeCleanerIdsSorted.find((id) => params.cleanerPassesGate(id)) ?? null;
}
