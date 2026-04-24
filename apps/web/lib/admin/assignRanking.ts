/** When SLA breach minutes ≥ this, rank cleaners rating/reliability first, distance last (speed over proximity). */
export const SLA_SPEED_FIRST_MINUTES = 25;

export type CleanerOption = {
  id: string;
  full_name: string;
  status: string | null;
  is_available?: boolean | null;
  rating?: number | null;
  jobs_completed?: number | null;
  distance_km?: number | null;
  reliability_score?: number | null;
};

export type SlotEligibilityForRank = {
  canAssignWithoutForce: boolean;
};

function rosterCleaners(cleaners: CleanerOption[]): CleanerOption[] {
  return cleaners.filter(
    (c) => c.is_available === true || String(c.status ?? "").toLowerCase() === "available",
  );
}

function reliabilityRankKey(c: CleanerOption): number {
  if (typeof c.reliability_score === "number" && Number.isFinite(c.reliability_score)) {
    return c.reliability_score;
  }
  return typeof c.jobs_completed === "number" && Number.isFinite(c.jobs_completed) ? c.jobs_completed : 0;
}

function rankCleanersDistanceFirst(pool: CleanerOption[]): CleanerOption[] {
  return [...pool].sort((a, b) => {
    const distanceA = typeof a.distance_km === "number" ? a.distance_km : Number.POSITIVE_INFINITY;
    const distanceB = typeof b.distance_km === "number" ? b.distance_km : Number.POSITIVE_INFINITY;
    if (distanceA !== distanceB) return distanceA - distanceB;
    const ratingA = typeof a.rating === "number" ? a.rating : -1;
    const ratingB = typeof b.rating === "number" ? b.rating : -1;
    if (ratingB !== ratingA) return ratingB - ratingA;
    return reliabilityRankKey(b) - reliabilityRankKey(a);
  });
}

function rankCleanersSpeedFirst(pool: CleanerOption[]): CleanerOption[] {
  return [...pool].sort((a, b) => {
    const ratingA = typeof a.rating === "number" ? a.rating : -1;
    const ratingB = typeof b.rating === "number" ? b.rating : -1;
    if (ratingB !== ratingA) return ratingB - ratingA;
    const rel = reliabilityRankKey(b) - reliabilityRankKey(a);
    if (rel !== 0) return rel;
    const distanceA = typeof a.distance_km === "number" ? a.distance_km : Number.POSITIVE_INFINITY;
    const distanceB = typeof b.distance_km === "number" ? b.distance_km : Number.POSITIVE_INFINITY;
    return distanceA - distanceB;
  });
}

export function rankCleanersForPool(
  pool: CleanerOption[],
  slaBreachMinutes: number | null | undefined,
): CleanerOption[] {
  const urgent = slaBreachMinutes != null && slaBreachMinutes >= SLA_SPEED_FIRST_MINUTES;
  return urgent ? rankCleanersSpeedFirst(pool) : rankCleanersDistanceFirst(pool);
}

export type AutoAssignRankOpts = {
  requireSlotOk: boolean;
  slaBreachMinutes?: number | null;
};

export function rankCleanersForAutoAssign(
  cleaners: CleanerOption[],
  eligibility: Record<string, SlotEligibilityForRank> | null,
  opts: AutoAssignRankOpts,
): CleanerOption[] {
  const roster = rosterCleaners(cleaners);
  const pool =
    eligibility && opts.requireSlotOk
      ? roster.filter((c) => eligibility[c.id]?.canAssignWithoutForce)
      : roster;
  const seen = new Set<string>();
  const out: CleanerOption[] = [];
  for (const c of rankCleanersForPool(pool, opts.slaBreachMinutes)) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

export function getBestCleanerForAssign(
  cleaners: CleanerOption[],
  eligibility: Record<string, SlotEligibilityForRank> | null,
  opts?: { requireSlotOk?: boolean; slaBreachMinutes?: number | null },
): CleanerOption | null {
  const requireSlotOk = opts?.requireSlotOk !== false;
  const ranked = rankCleanersForAutoAssign(cleaners, eligibility, {
    requireSlotOk: requireSlotOk,
    slaBreachMinutes: opts?.slaBreachMinutes,
  });
  return ranked[0] ?? null;
}

export function getBestCleaner(cleaners: CleanerOption[]): CleanerOption | null {
  return getBestCleanerForAssign(cleaners, null, { requireSlotOk: false });
}
