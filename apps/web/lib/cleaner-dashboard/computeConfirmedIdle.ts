/**
 * Decide whether the dashboard can confidently tell the cleaner that there
 * is nothing to do right now. Until this returns `true`, the empty hint
 * shows a softer "Checking for nearby jobs..." copy instead of the
 * definitive "You're online and waiting for offers" / "Nothing next in
 * your queue" line.
 *
 * Pure / testable. Inputs are sourced from `useCleanerDashboardData`.
 *
 * Rules:
 *  - While `loading` is true → never confirmed.
 *  - While either fetch surface is in error → never confirmed (data may be
 *    stale / partial; surfacing "no jobs" would be wrong).
 *  - When the cleaner has paused offers (`receivingOffers === false`) we
 *    DO confirm — the empty state is then about the cleaner choosing to
 *    be offline, not about the system still searching.
 *  - Otherwise, only confirm when offers are empty AND the next-job slot
 *    is empty AND no in-progress / en route active job exists.
 */
export type ComputeConfirmedIdleInput = {
  loading: boolean;
  offersError: string | null;
  dashboardError: string | null;
  pendingOffersCount: number;
  hasNextJob: boolean;
  hasActiveJob: boolean;
  receivingOffers: boolean;
};

export function computeConfirmedIdle(input: ComputeConfirmedIdleInput): boolean {
  if (input.loading) return false;
  if (input.offersError != null || input.dashboardError != null) return false;
  if (input.pendingOffersCount > 0) return false;
  if (input.hasNextJob || input.hasActiveJob) return false;
  // When the cleaner has paused offers we can confidently say "you're paused".
  // When they are receiving offers we can confidently say "we're searching"
  // OR "no jobs right now" — both are true confirmations of the empty state.
  return true;
}
