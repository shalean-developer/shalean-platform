/**
 * Coarse lifecycle progression for stale-read / optimistic reconciliation.
 * Higher = further along the happy path (not exhaustive of all booking statuses).
 */

import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";

export type LifecycleWireLike = {
  status?: string | null;
  /** Mirrors accept commit — used with `cleaner_response_status` for dual-signal UI. */
  accepted_at?: string | null;
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
  let r = Math.max(20, rankFromCleanerResponse(cr));
  if (Boolean(String(w.accepted_at ?? "").trim())) {
    r = Math.max(r, 50);
  }
  return r;
}

export function lifecyclePhaseRankFromPatch(patch: Partial<LifecycleWireLike> | null | undefined): number {
  if (!patch) return 0;
  const st = patch.status != null ? String(patch.status).toLowerCase() : "";
  if (st === "cancelled" || st === "failed") return 110;
  if (st === "completed" || patch.completed_at) return 100;
  if (st === "in_progress" || patch.started_at) return 80;
  if (patch.en_route_at) return 60;
  const cr = patch.cleaner_response_status != null ? String(patch.cleaner_response_status).toLowerCase() : "";
  const crR = rankFromCleanerResponse(cr);
  if (patch.accepted_at != null && String(patch.accepted_at).trim()) {
    return Math.max(crR, 50);
  }
  return crR;
}

/** Overlay optimistic lifecycle fields onto a (possibly stale) GET payload. Skips undefined patch keys. */
export function mergeLifecyclePatchOntoIncoming<T extends LifecycleWireLike>(
  incoming: T,
  patch: Partial<LifecycleWireLike> | null,
): T {
  if (!patch) return incoming;
  const base = { ...incoming } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch) as [keyof LifecycleWireLike, unknown][]) {
    if (v === undefined) continue;
    base[k as string] = v;
  }
  return base as T;
}

/** Lifecycle columns only — safe to overlay from cache / `prev` onto a fresh GET row. */
export function lifecycleFieldsPatchFrom(prev: LifecycleWireLike): Partial<LifecycleWireLike> {
  return {
    status: prev.status,
    cleaner_response_status: prev.cleaner_response_status,
    accepted_at: prev.accepted_at,
    en_route_at: prev.en_route_at,
    started_at: prev.started_at,
    completed_at: prev.completed_at,
  };
}

/**
 * If the server payload looks behind optimistic / current UI progression, keep the prior row
 * (avoids flicker from lagging reads). Caller passes current client job + incoming GET job.
 *
 * When the server is behind the **optimistic patch** only (e.g. accept wrote `cleaner_response_status`
 * but the next GET is stale), merge patch onto `incoming` instead of returning `prev`, so callers
 * can safely clear optimistic state without losing acknowledged lifecycle fields.
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
    return mergeLifecyclePatchOntoIncoming(incoming, optimisticPatch);
  }
  if (rInc < display && display >= 80) {
    return prev;
  }
  /**
   * No optimistic patch (e.g. user left job detail after accept): `prev` may be session cache or
   * last React state with `cleaner_response_status: accepted` while the GET is still `pending`.
   * Fold higher-ranked lifecycle fields from `prev` onto `incoming` — same idea as optimistic merge.
   */
  if (optimisticPatch == null && rPatch === 0 && rPrev > rInc) {
    return mergeLifecyclePatchOntoIncoming(incoming, lifecycleFieldsPatchFrom(prev));
  }
  return incoming;
}
