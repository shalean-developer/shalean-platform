import {
  type LifecycleWireLike,
  lifecyclePhaseRankFromWire,
} from "@/lib/cleaner/cleanerJobLifecyclePhaseRank";
import type { PendingLifecycleAction } from "@/lib/cleaner/cleanerJobPendingLifecycleQueue";

/**
 * If we already have server (or cached) state at or past this action, the queued POST is redundant — drop it.
 * Uses the same coarse ranks as `lifecyclePhaseRankFromWire` (50 accept, 60 en_route, 80 in_progress, 100 completed).
 */
export function shouldDropStaleQueuedLifecycleAction(
  action: PendingLifecycleAction,
  wire: LifecycleWireLike | null,
): boolean {
  if (!wire) return false;
  const r = lifecyclePhaseRankFromWire(wire);
  const st = String(wire.status ?? "").toLowerCase();
  const terminal = st === "cancelled" || st === "failed" || r >= 110;
  switch (action) {
    case "accept":
      return r >= 50;
    case "reject":
      return r >= 60 || terminal;
    case "en_route":
      return r >= 60;
    case "start":
      return r >= 80;
    case "complete":
      return r >= 100;
    default:
      return false;
  }
}

export function wireLikeFromJobDetailCacheBody(body: Record<string, unknown> | null | undefined): LifecycleWireLike | null {
  if (!body || typeof body !== "object") return null;
  return {
    status: typeof body.status === "string" ? body.status : null,
    en_route_at: typeof body.en_route_at === "string" ? body.en_route_at : null,
    started_at: typeof body.started_at === "string" ? body.started_at : null,
    completed_at: typeof body.completed_at === "string" ? body.completed_at : null,
    cleaner_response_status:
      typeof body.cleaner_response_status === "string" ? body.cleaner_response_status : null,
  };
}
