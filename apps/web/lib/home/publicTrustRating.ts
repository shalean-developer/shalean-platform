import type { PublicReviewBannerStats } from "@/lib/home/reviewBannerStats";
import { GOOGLE_BUSINESS_REVIEWS } from "@/lib/seo/googleReviews";

/** Verified Google Business Profile aggregate (must match JSON-LD AggregateRating). */
export const PUBLIC_AGGREGATE_RATING = GOOGLE_BUSINESS_REVIEWS.rating;
export const PUBLIC_AGGREGATE_REVIEW_COUNT = GOOGLE_BUSINESS_REVIEWS.count;

/** @deprecated Use PUBLIC_AGGREGATE_RATING — kept for incremental refactors. */
export const PUBLIC_TRUST_RATING_FALLBACK = PUBLIC_AGGREGATE_RATING;

/** Single average for star rows (homepage hero, service hero badge, etc.). */
export function publicTrustAverageDisplay(_stats: PublicReviewBannerStats | null): string {
  return PUBLIC_AGGREGATE_RATING.toFixed(1);
}

/** Trust-strip style title (matches homepage trust card). */
export function publicTrustRatingCardTitle(_stats: PublicReviewBannerStats | null): string {
  return `Rated ${PUBLIC_AGGREGATE_RATING.toFixed(1)} ★ from ${PUBLIC_AGGREGATE_REVIEW_COUNT} Google reviews`;
}

/** Short badge line for service/location heroes. */
export function publicTrustRatingBadgeLine(stats: PublicReviewBannerStats | null): string {
  return `⭐ ${publicTrustAverageDisplay(stats)} rating`;
}
