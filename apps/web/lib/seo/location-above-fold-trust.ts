/**
 * Every programmatic location hub now surfaces reviews, credentials and booking reassurance
 * directly around the hero. Keep the named set only for location-specific copy variants.
 */
export const LOCATION_ABOVE_FOLD_TRUST_SLUGS = new Set([
  "bantry-bay-cleaning-services",
  "bellville-cleaning-services",
  "bergvliet-cleaning-services",
  "camps-bay-cleaning-services",
]);

/** Shared location-page template guarantee: all location hubs carry above-fold trust proof. */
export function locationUsesAboveFoldTrust(_slug: string): boolean {
  return true;
}

/** Short hero trust bullets — visible without scrolling on every location hub. */
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
    case "sea-point-cleaning-services":
      // Sea Point already renders its tailored pricing / same-day / local-cleaner row in the hero.
      return null;
    default:
      return ["Vetted & insured teams", "Upfront online pricing", "Google-reviewed Cape Town"];
  }
}
