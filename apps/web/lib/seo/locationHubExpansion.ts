/**
 * Location hubs added in the Jul 2026 catalogue expansion (23 → 43).
 * Used to gate trust UI and identify pending .com redirect rules.
 */
export const LOCATION_HUB_EXPANSION_JUL_2026_SLUGS = [
  "bishopscourt-cleaning-services",
  "diep-river-cleaning-services",
  "harfield-village-cleaning-services",
  "meadowridge-cleaning-services",
  "tokai-cleaning-services",
  "pinelands-cleaning-services",
  "mowbray-cleaning-services",
  "rondebosch-east-cleaning-services",
  "southfield-cleaning-services",
  "heathfield-cleaning-services",
  "hout-bay-cleaning-services",
  "clifton-cleaning-services",
  "mouille-point-cleaning-services",
  "three-anchor-bay-cleaning-services",
  "oranjezicht-cleaning-services",
  "de-waterkant-cleaning-services",
  "century-city-cleaning-services",
  "milnerton-cleaning-services",
  "bloubergstrand-cleaning-services",
  "goodwood-cleaning-services",
] as const;

export type LocationHubExpansionJul2026Slug = (typeof LOCATION_HUB_EXPANSION_JUL_2026_SLUGS)[number];

const EXPANSION_SET = new Set<string>(LOCATION_HUB_EXPANSION_JUL_2026_SLUGS);

export function isLocationHubExpansionJul2026Slug(slug: string): boolean {
  return EXPANSION_SET.has(slug);
}

/**
 * Prefer suppressing illustrative/composite review snippets on expansion hubs —
 * disclosure alone still reads like testimonials to many users.
 */
export function shouldRenderIllustrativeLocationReviews(slug: string): boolean {
  return !isLocationHubExpansionJul2026Slug(slug);
}
