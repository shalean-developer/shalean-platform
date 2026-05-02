/**
 * Coarse lifecycle progression for stale-read / optimistic reconciliation.
 * Higher = further along the happy path (not exhaustive of all booking statuses).
 */

import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";

export type LifecycleWireLike = {
  status?: string | null;
  en_route_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  cleaner_response_status?: string | null;
};

function rankFromCleanerResponse(cr: string): number {
  if (cr === CLEANER_RESPONSE.STARTED) return 75;
  if (cr === CLEANER_RESPONSE.ON_MY_WAY) return 60;
  if (cr === CLEANER_RESPONSE.ACCEPTED) return 50;
  return 0;
}

export function lifecyclePhaseRankFromWire(w: LifecycleWireLike | null | undefined): number {
  if (!w) return 0;
  const st = String(w.status ?? "").toLowerCase();
  if (st === "cancelled" || st === "failed") return 110;
  if (st === "completed") return 100;
  if (st === "in_progress") return 80;
  if (w.completed_at) return 100;
  if (w.started_at) return 80;
  if (w.en_route_at) return 60;
  const cr = String(w.cleaner_response_status ?? "").toLowerCase();
  return Math.max(20, rankFromCleanerResponse(cr));
}

export function lifecyclePhaseRankFromPatch(patch: Partial<LifecycleWireLike> | null | undefined): number {
  if (!patch) return 0;
  const st = patch.status != null ? String(patch.status).toLowerCase() : "";
  if (st === "cancelled" || st === "failed") return 110;
  if (st === "completed" || patch.completed_at) return 100;
  if (st === "in_progress" || patch.started_at) return 80;
  if (patch.en_route_at) return 60;
  const cr = patch.cleaner_response_status != null ? String(patch.cleaner_response_status).toLowerCase() : "";
  return rankFromCleanerResponse(cr);
}

/**
 * If the server payload looks behind optimistic / current UI progression, keep the prior row
 * (avoids flicker from lagging reads). Caller passes current client job + incoming GET job.
 */
export function pickIncomingJobAvoidPhaseRegression<T extends LifecycleWireLike>(
  prev: T | null,
  incoming: T | null,
  optimisticPatch: Partial<LifecycleWireLike> | null,
): T | null {
  if (!incoming) return incoming;
  if (!prev) return incoming;
  const stInc = String(incoming.status ?? "").toLowerCase();
  const stPrev = String(prev.status ?? "").toLowerCase();
  const incTerminal = stInc === "cancelled" || stInc === "failed";
  const prevTerminal = stPrev === "cancelled" || stPrev === "failed";
  if (incTerminal) return incoming;
  if (prevTerminal && !incTerminal) return prev;

  const rPrev = lifecyclePhaseRankFromWire(prev);
  const rPatch = lifecyclePhaseRankFromPatch(optimisticPatch);
  const rInc = lifecyclePhaseRankFromWire(incoming);
  const display = Math.max(rPrev, rPatch);
  if (rPatch > rPrev && rInc < rPatch) {
    return prev;
  }
  if (rInc < display && display >= 80) {
    return prev;
  }
  return incoming;
}
