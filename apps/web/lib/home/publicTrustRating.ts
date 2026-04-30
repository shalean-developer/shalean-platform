import type { PublicReviewBannerStats } from "@/lib/home/reviewBannerStats";

/** Shown when there are no (or insufficient) public aggregate review stats. */
export const PUBLIC_TRUST_RATING_FALLBACK = 4.9;

/** Single average for star rows (homepage hero, service hero badge, etc.). */
export function publicTrustAverageDisplay(stats: PublicReviewBannerStats | null): string {
  if (stats != null && stats.reviewCount >= 1 && Number.isFinite(stats.avgRating)) {
    return stats.avgRating.toFixed(1);
  }
  return PUBLIC_TRUST_RATING_FALLBACK.toFixed(1);
}

/** Trust-strip style title (matches homepage trust card). */
export function publicTrustRatingCardTitle(stats: PublicReviewBannerStats | null): string {
  if (stats != null && stats.reviewCount >= 1) {
    const n = stats.reviewCount;
    const by = n >= 10 ? `${n}+ customers` : n === 1 ? "1 customer" : `${n} customers`;
    return `Rated ${stats.avgRating.toFixed(1)} ★ by ${by}`;
  }
  return `${PUBLIC_TRUST_RATING_FALLBACK.toFixed(1)} rating`;
}

/** Short badge line for service/location heroes. */
export function publicTrustRatingBadgeLine(stats: PublicReviewBannerStats | null): string {
  return `⭐ ${publicTrustAverageDisplay(stats)} rating`;
}
