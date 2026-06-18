import type { CleanerUpcomingJob } from "@/components/cleaner-dashboard/types";

/**
 * Active-job phases on the dashboard: a job the cleaner is currently driving
 * to or executing. Order matters — `In progress` ranks above `En route` so we
 * never demote a started job to a navigation hint.
 */
const ACTIVE_PHASE_RANK: ReadonlyArray<{ display: string; rank: number }> = [
  { display: "in progress", rank: 2 },
  { display: "en route", rank: 1 },
  // Some surfaces emit "On the way" / "On my way" — accept both.
  { display: "on the way", rank: 1 },
  { display: "on my way", rank: 1 },
];

function activeRank(phaseDisplay: string | null | undefined): number {
  const p = String(phaseDisplay ?? "").trim().toLowerCase();
  if (!p) return 0;
  for (const r of ACTIVE_PHASE_RANK) if (p === r.display) return r.rank;
  return 0;
}

/**
 * Pick the cleaner's currently-active job (in progress > en route). Returns
 * `null` when nothing is in flight; callers fall through to the next-job pin
 * or the empty hint.
 *
 * Pure / testable; consumed by `useCleanerDashboardData` to drive the
 * dispatch-console hero on Home.
 */
export function selectActiveJob(jobs: readonly CleanerUpcomingJob[]): CleanerUpcomingJob | null {
  let best: { job: CleanerUpcomingJob; rank: number } | null = null;
  for (const j of jobs) {
    const rank = activeRank(j.phaseDisplay);
    if (rank <= 0) continue;
    if (!best || rank > best.rank) {
      best = { job: j, rank };
    }
  }
  return best?.job ?? null;
}

/** Navigation is only relevant while driving to the job — not once cleaning has started. */
export function cleanerActiveJobShowsNavigation(phaseDisplay: string | null | undefined): boolean {
  const p = String(phaseDisplay ?? "").trim().toLowerCase();
  return p === "en route" || p === "on the way" || p === "on my way";
}
