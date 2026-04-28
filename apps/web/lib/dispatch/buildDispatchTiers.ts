import type { SmartDispatchCandidate } from "@/lib/dispatch/types";

export type DispatchTierLabel = "A" | "B" | "C";

export type TieredCleaner = {
  candidate: SmartDispatchCandidate;
  tier: DispatchTierLabel;
  /** Descending job-fit score used for ordering within tier. */
  jobFitScore: number;
};

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

/**
 * Split already-sorted-best-first cleaners into A / B / C tiers.
 * Sizes configurable: DISPATCH_TIER_A_SIZE (default 4), DISPATCH_TIER_B_SIZE (default 7).
 */
export function buildDispatchTiers(sortedCandidates: SmartDispatchCandidate[], jobFitScores: Map<string, number>): {
  tierA: TieredCleaner[];
  tierB: TieredCleaner[];
  tierC: TieredCleaner[];
} {
  const sizeA = envInt("DISPATCH_TIER_A_SIZE", 4);
  const sizeB = envInt("DISPATCH_TIER_B_SIZE", 7);
  const tierA: TieredCleaner[] = [];
  const tierB: TieredCleaner[] = [];
  const tierC: TieredCleaner[] = [];
  sortedCandidates.forEach((c, idx) => {
    const jobFitScore = jobFitScores.get(c.id) ?? 0;
    if (idx < sizeA) tierA.push({ candidate: c, tier: "A", jobFitScore });
    else if (idx < sizeA + sizeB) tierB.push({ candidate: c, tier: "B", jobFitScore });
    else tierC.push({ candidate: c, tier: "C", jobFitScore });
  });
  return { tierA, tierB, tierC };
}
