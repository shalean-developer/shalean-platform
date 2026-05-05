/**
 * Editorial keyword → canonical owning URL (avoid cannibalization in new pages).
 * Reference when authoring titles/H1s; enforce manually in content reviews for now.
 */
export const KEYWORD_PRIMARY_ROUTE: Record<string, string> = {
  /** Broad city intent → city hub; standard cleaning stays the primary booking path for “standard” queries. */
  "cleaning services cape town": "/cleaning-services-cape-town",
  "cleaning services claremont": "/locations/claremont-cleaning-services",
  "deep cleaning cape town": "/services/deep-cleaning-cape-town",
  "standard cleaning cape town": "/services/standard-cleaning-cape-town",
  "move out cleaning cape town": "/services/move-out-cleaning-cape-town",
  "cleaning prices cape town": "/blog/how-much-does-cleaning-cost-cape-town",
  "airbnb cleaning cape town": "/services/airbnb-cleaning-cape-town",
};
