import type {
  BookingScoringContext,
  CleanerScoreBreakdown,
  CleanerScoreResult,
  CleanerScoringInput,
} from "@/lib/marketplace-intelligence/types";

const DEFAULT_MAX_DAILY = 4;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Marketplace cleaner score with an explicit breakdown for analytics and ranking experiments.
 * Higher is better. Tuned to be fast (pure math, no I/O).
 */
export function scoreCleanerForBooking(
  cleaner: CleanerScoringInput,
  _booking: BookingScoringContext,
): CleanerScoreResult {
  const maxDaily = cleaner.maxDailyJobs ?? DEFAULT_MAX_DAILY;

  // Distance: closer → higher (asymptotic).
  const distance = clamp(25 / (cleaner.distanceKm + 1.2), 0, 25);

  // Rating: 0–5 → 0–25
  const rating = clamp((Number.isFinite(cleaner.rating) ? cleaner.rating : 0) * 5, 0, 25);

  // Reliability: acceptance minus decline penalty
  const acc = clamp(Number.isFinite(cleaner.acceptanceRate) ? cleaner.acceptanceRate : 0.5, 0, 1);
  const declinePenalty = Math.min(12, cleaner.recentDeclines * 2.5);
  const reliability = clamp(acc * 22 - declinePenalty, 0, 25);

  // Workload: overloaded → penalty
  const loadRatio = cleaner.workloadToday / Math.max(1, maxDaily);
  const workload = clamp(25 * (1 - clamp(loadRatio, 0, 1.4) / 1.4), 0, 25);

  // Recency: spread assignments (cooling) — null last assignment is neutral-high
  let recency = 18;
  if (cleaner.lastAssignmentAt) {
    const t = Date.parse(cleaner.lastAssignmentAt);
    if (Number.isFinite(t)) {
      const hoursSince = (Date.now() - t) / 3_600_000;
      // Very recent assignment → lower recency score; > 18h → full
      recency = clamp(8 + Math.min(17, hoursSince * 0.9), 0, 25);
    }
  }

  const breakdown: CleanerScoreBreakdown = {
    distance: Math.round(distance * 100) / 100,
    rating: Math.round(rating * 100) / 100,
    reliability: Math.round(reliability * 100) / 100,
    workload: Math.round(workload * 100) / 100,
    recency: Math.round(recency * 100) / 100,
  };

  const score =
    Math.round((breakdown.distance + breakdown.rating + breakdown.reliability + breakdown.workload + breakdown.recency) * 100) /
    100;

  return { score, breakdown };
}
