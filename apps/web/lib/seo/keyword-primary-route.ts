/**
 * Editorial keyword → canonical owning URL (avoid cannibalization in new pages).
 * Reference when authoring titles/H1s; enforce manually in content reviews for now.
 */
export const KEYWORD_PRIMARY_ROUTE: Record<string, string> = {
  /** Broad city intent → canonical services hub; standard cleaning keeps its focused booking route. */
  "cleaning services cape town": "/services",
  "cleaning services claremont": "/locations/claremont-cleaning-services",
  "deep cleaning cape town": "/services/deep-cleaning-cape-town",
  "standard cleaning cape town": "/services/standard-cleaning-cape-town",
  "move out cleaning cape town": "/services/move-out-cleaning-cape-town",
  "cleaning prices cape town": "/blog/how-much-does-cleaning-cost-cape-town-2026",
  "airbnb cleaning cape town": "/services/airbnb-cleaning-cape-town",
};
