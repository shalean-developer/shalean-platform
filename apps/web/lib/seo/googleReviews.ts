import { CUSTOMER_SUPPORT_WHATSAPP_URL } from "@/lib/site/customerSupport";

/**
 * Verified Google Business Profile aggregate stats — single source for UI, JSON-LD, and copy.
 * Upgrade path: replace constants with Places API sync or CMS.
 */
export const GOOGLE_BUSINESS_REVIEWS = {
  rating: 4.8,
  count: 129,
} as const;

/** Alias — same verified aggregate as `GOOGLE_BUSINESS_REVIEWS`. */
export const GOOGLE_REVIEWS = GOOGLE_BUSINESS_REVIEWS;

/** JSON-LD aggregateRating string fields (schema.org expects strings). */
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
