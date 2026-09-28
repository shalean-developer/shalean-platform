import { PUBLIC_BUSINESS_GOOGLE_PROFILE_URL } from "@/lib/site/publicBusinessIdentity";

/**
 * Official profile URLs for JSON-LD `sameAs` on LocalBusiness.
 * The verified GBP entity URL is always present; optional social profiles are included only when configured.
 */

function normalizeCandidate(u: string | undefined): string | null {
  const t = u?.trim();
  if (!t || !/^https?:\/\//i.test(t)) return null;
  return t;
}

/** Deduplicated list suitable for schema.org `sameAs` (URL or URL[]). */
export function getBrandSameAsForJsonLd(): string[] {
  const candidates = [
    PUBLIC_BUSINESS_GOOGLE_PROFILE_URL,
    normalizeCandidate(process.env.NEXT_PUBLIC_BRAND_FACEBOOK_URL),
    normalizeCandidate(process.env.NEXT_PUBLIC_BRAND_INSTAGRAM_URL),
    normalizeCandidate(process.env.NEXT_PUBLIC_BRAND_LINKEDIN_URL),
  ].filter(Boolean) as string[];
  return [...new Set(candidates)];
}
