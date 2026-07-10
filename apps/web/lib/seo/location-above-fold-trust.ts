/** Location hubs that surface reviews, guarantees, and credential cues directly under the hero. */
export const LOCATION_ABOVE_FOLD_TRUST_SLUGS = new Set([
  "bantry-bay-cleaning-services",
  "bellville-cleaning-services",
  "bergvliet-cleaning-services",
  "camps-bay-cleaning-services",
]);

export function locationUsesAboveFoldTrust(slug: string): boolean {
  return LOCATION_ABOVE_FOLD_TRUST_SLUGS.has(slug);
}

/** Short hero trust bullets — visible without scrolling on priority hubs. */
export function locationAboveFoldTrustBullets(slug: string): readonly string[] | null {
  switch (slug) {
    case "bantry-bay-cleaning-services":
      return ["Discreet cliff-side crews", "Vetted & insured teams", "Google-reviewed Cape Town"];
    case "bellville-cleaning-services":
      return ["Upfront online pricing", "Move-out & recurring cleans", "Trusted local teams"];
    case "bergvliet-cleaning-services":
      return ["Family-home specialists", "Pet-friendly crews", "Google-reviewed Cape Town"];
    case "camps-bay-cleaning-services":
      return ["Guest-ready turnovers", "Vetted & insured teams", "Google-reviewed Cape Town"];
    default:
      return null;
  }
}
