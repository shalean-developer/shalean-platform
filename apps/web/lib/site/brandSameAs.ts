/**
 * Official profile URLs for JSON-LD `sameAs` on LocalBusiness.
 * Only verified URLs — omit property entirely when unset (avoid generic homepage links).
 */

function normalizeCandidate(u: string | undefined): string | null {
  const t = u?.trim();
  if (!t || !/^https?:\/\//i.test(t)) return null;
  return t;
}

/** Deduplicated list suitable for schema.org `sameAs` (URL or URL[]). */
export function getBrandSameAsForJsonLd(): string[] {
  const candidates = [
    normalizeCandidate(process.env.NEXT_PUBLIC_BRAND_FACEBOOK_URL),
    normalizeCandidate(process.env.NEXT_PUBLIC_BRAND_INSTAGRAM_URL),
    normalizeCandidate(process.env.NEXT_PUBLIC_BRAND_LINKEDIN_URL),
    normalizeCandidate(process.env.NEXT_PUBLIC_GOOGLE_BUSINESS_PROFILE_URL),
  ].filter(Boolean) as string[];
  return [...new Set(candidates)];
}
