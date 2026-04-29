import type { LiveCleaner } from "@/components/booking/useCleaners";
import { bookingCopy } from "@/lib/booking/copy";

export type UiCleaner = {
  id: string;
  name: string;
  rating: number;
  completedJobs: number;
  score: number;
  badges: string[];
  isRecommended: boolean;
  rank: number;
  isPremium: boolean;
  /** Optional client-forwarded delta vs baseline; null when unknown (no pricing per cleaner). */
  priceDelta: number | null;
  /** Rank 1 with a strong score lead over #2 — for “most customers” microcopy only. */
  showStrongDefaultBias: boolean;
};

type CleanerForScore = {
  rating: number;
  jobs_completed: number;
  reliabilityScore?: number | null;
};

/** Pure client-side ranking — does not affect API eligibility or dispatch. */
export function scoreCleaner(c: CleanerForScore): number {
  const rating = Number.isFinite(c.rating) ? c.rating : 0;
  const jobs = Number.isFinite(c.jobs_completed) ? Math.max(0, c.jobs_completed) : 0;
  const ratingScore = (rating / 5) * 50;
  const experienceScore = Math.min(jobs / 100, 1) * 30;
  const rel =
    typeof c.reliabilityScore === "number" && Number.isFinite(c.reliabilityScore)
      ? Math.min(Math.max(c.reliabilityScore, 0), 1)
      : 0;
  const reliabilityScore = rel * 20;
  return ratingScore + experienceScore + reliabilityScore;
}

export function computeIsPremium(
  rating: number,
  completedJobs: number,
  reliabilityScore?: number | null,
): boolean {
  const rel = typeof reliabilityScore === "number" && Number.isFinite(reliabilityScore) ? reliabilityScore : null;
  return (rating >= 4.8 && completedJobs >= 100) || (rel != null && rel >= 0.9);
}

function buildOrderedBadges(args: {
  rank: number;
  isPremium: boolean;
  rating: number;
  completedJobs: number;
  reliabilityScore?: number | null;
}): string[] {
  const badges: string[] = [];
  if (args.rank === 1) badges.push("Recommended");
  if (args.isPremium) badges.push(bookingCopy.cleaner.premiumBadge);
  if (args.completedJobs >= 100) badges.push("Most booked");
  if (typeof args.reliabilityScore === "number" && args.reliabilityScore >= 0.85) {
    badges.push("Reliable");
  }
  return badges;
}

export function pickBadgesWithCap(badges: readonly string[], cap: number): string[] {
  const n = Math.max(0, Math.floor(cap));
  return badges.slice(0, n);
}

/** Sort by score desc, assign rank and up to two trust badges (client-only). */
export function buildUiCleaners(pool: readonly LiveCleaner[]): UiCleaner[] {
  const scored = pool.map((c) => {
    const rating = typeof c.rating === "number" && Number.isFinite(c.rating) ? c.rating : 0;
    const completedJobs =
      typeof c.jobs_completed === "number" && Number.isFinite(c.jobs_completed) ? Math.max(0, c.jobs_completed) : 0;
    const relRaw = (c as { reliability_score?: unknown }).reliability_score;
    const reliabilityScore =
      typeof relRaw === "number" && Number.isFinite(relRaw) ? Math.min(Math.max(relRaw, 0), 1) : undefined;
    const score = scoreCleaner({
      rating,
      jobs_completed: completedJobs,
      reliabilityScore: reliabilityScore ?? undefined,
    });
    return { c, rating, completedJobs, score, reliabilityScore };
  });
  scored.sort((a, b) => b.score - a.score);
  const secondScore = scored.length >= 2 ? scored[1]!.score : null;

  return scored.map((row, index) => {
    const rank = index + 1;
    const isPremium = computeIsPremium(row.rating, row.completedJobs, row.reliabilityScore);
    const dz = row.c.price_delta_zar;
    const priceDelta = typeof dz === "number" && Number.isFinite(dz) ? Math.round(dz) : null;

    const showStrongDefaultBias =
      rank === 1 && secondScore != null && row.score - secondScore >= 8 && isPremium;

    const ordered = buildOrderedBadges({
      rank,
      isPremium,
      rating: row.rating,
      completedJobs: row.completedJobs,
      reliabilityScore: row.reliabilityScore,
    });
    const badges = pickBadgesWithCap(ordered, 2);
    return {
      id: row.c.id,
      name: row.c.full_name,
      rating: row.rating,
      completedJobs: row.completedJobs,
      score: row.score,
      badges,
      isRecommended: rank === 1,
      rank,
      isPremium,
      priceDelta,
      showStrongDefaultBias,
    };
  });
}
