import { absoluteCanonicalUrl } from "@/lib/site/canonical";

export const CLEANING_PRICES_CAPE_TOWN_PATH = "/cleaning-prices-cape-town";

export const CLEANING_PRICES_META_TITLE =
  "Cleaning Prices Cape Town (2026) | House, Deep & Move-Out Costs";

export const CLEANING_PRICES_META_DESCRIPTION =
  "See cleaning prices in Cape Town (2026). Compare house, deep, move-out, and office cleaning costs. Get an instant quote in seconds.";

export const CLEANING_PRICES_META_TWITTER_DESCRIPTION =
  "Compare house, deep, move-out, and office cleaning costs in Cape Town (2026). Instant quote in seconds.";

export const CLEANING_PRICES_OG_IMAGE = "/images/marketing/standard-cleaning-cape-town-kitchen.webp";

export function cleaningPricesHubCanonicalUrl(): string {
  return absoluteCanonicalUrl(CLEANING_PRICES_CAPE_TOWN_PATH);
}
