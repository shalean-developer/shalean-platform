import { CUSTOMER_SUPPORT_WHATSAPP_URL } from "@/lib/site/customerSupport";

/**
 * Verified Google Business Profile aggregate stats — single source for visible UI and copy.
 * These third-party values are intentionally not emitted as Shalean LocalBusiness aggregateRating markup.
 */
export const GOOGLE_BUSINESS_REVIEWS = {
  rating: 4.8,
  count: 128,
  verifiedAt: "2026-08-30",
} as const;

/** Re-verify the public Google Business Profile at least every 90 days. */
export const GOOGLE_BUSINESS_REVIEWS_MAX_AGE_DAYS = 90;

/** Alias — same verified aggregate as `GOOGLE_BUSINESS_REVIEWS`. */
export const GOOGLE_REVIEWS = GOOGLE_BUSINESS_REVIEWS;

export function googleBusinessReviewsAgeDays(now = new Date()): number {
  const verifiedAt = Date.parse(`${GOOGLE_BUSINESS_REVIEWS.verifiedAt}T00:00:00Z`);
  if (!Number.isFinite(verifiedAt)) return Number.POSITIVE_INFINITY;
  return Math.floor((now.getTime() - verifiedAt) / 86_400_000);
}

export function areGoogleBusinessReviewsFresh(now = new Date()): boolean {
  const ageDays = googleBusinessReviewsAgeDays(now);
  return ageDays >= 0 && ageDays <= GOOGLE_BUSINESS_REVIEWS_MAX_AGE_DAYS;
}

/** CI/build governance: forces a periodic manual or automated GBP verification. */
export function assertGoogleBusinessReviewsFresh(now = new Date()): void {
  if (areGoogleBusinessReviewsFresh(now)) return;
  throw new Error(
    `[seo] Google Business review data is stale. Re-verify rating/count and update verifiedAt (currently ${GOOGLE_BUSINESS_REVIEWS.verifiedAt}).`,
  );
}

/**
 * Schema helper retained for non-LocalBusiness consumers only. Do not attach externally sourced
 * Google Business Profile ratings to Shalean's own LocalBusiness structured data.
 */
export function googleBusinessAggregateRatingSchema(): {
  "@type": "AggregateRating";
  ratingValue: string;
  reviewCount: string;
} {
  return {
    "@type": "AggregateRating",
    ratingValue: String(GOOGLE_BUSINESS_REVIEWS.rating),
    reviewCount: String(GOOGLE_BUSINESS_REVIEWS.count),
  };
}

/**
 * Public write-review URL (Google). Set `NEXT_PUBLIC_GOOGLE_REVIEW_WRITE_URL` in production
 * e.g. https://search.google.com/local/writereview?placeid=ChIJ...
 */
export function getGoogleReviewWriteUrl(): string | null {
  const u = process.env.NEXT_PUBLIC_GOOGLE_REVIEW_WRITE_URL?.trim();
  if (u && /^https?:\/\//i.test(u)) return u;
  return null;
}

/** WhatsApp deep-link asking for a Google review (customer-facing). */
export function getGoogleReviewWhatsAppUrl(): string | null {
  const reviewUrl = getGoogleReviewWriteUrl();
  if (!reviewUrl) return null;
  const m = CUSTOMER_SUPPORT_WHATSAPP_URL.match(/wa\.me\/(\d+)/i);
  const phone = m?.[1] ?? "27825915525";
  const text = `Hi! Thanks for booking with Shalean 🙌 Please leave us a quick Google review: ${reviewUrl}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export function googleReviewsMarketingHeadline(): string {
  return `${GOOGLE_BUSINESS_REVIEWS.rating} from ${GOOGLE_BUSINESS_REVIEWS.count} Google reviews`;
}

export function googleReviewsShortTrustLine(): string {
  return `${GOOGLE_BUSINESS_REVIEWS.rating} ☆ Google rating · ${GOOGLE_BUSINESS_REVIEWS.count}+ reviews · Trusted cleaners in Cape Town`;
}

export function googleReviewsServiceTrustLine(): string {
  return `Trusted across Cape Town — ${GOOGLE_BUSINESS_REVIEWS.rating}★ on Google (${GOOGLE_BUSINESS_REVIEWS.count} reviews)`;
}

/** Hero subline based on the same verified third-party review count. */
export function googleReviewsBasedOnCountLine(): string {
  return `Based on ${GOOGLE_BUSINESS_REVIEWS.count}+ Google reviews`;
}

/** Booking funnel, checkout, and compact trust rows. */
export function googleReviewsBookingSocialProofLine(): string {
  return `${GOOGLE_BUSINESS_REVIEWS.rating}★ from ${GOOGLE_BUSINESS_REVIEWS.count} Google reviews`;
}

export function googleReviewsTrustBarTitle(): string {
  return `${GOOGLE_BUSINESS_REVIEWS.rating} Google rating`;
}

export function googleReviewsTrustBarSubtitle(): string {
  return `${GOOGLE_BUSINESS_REVIEWS.count} reviews`;
}

export function googleReviewsCountPlusDisplay(): string {
  return `${GOOGLE_BUSINESS_REVIEWS.count}+`;
}
