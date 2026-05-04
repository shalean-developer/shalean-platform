import { absoluteCanonicalUrl } from "@/lib/site/canonical";

export const MAID_SERVICES_CAPE_TOWN_PATH = "/maid-services-cape-town";

export const MAID_SERVICES_META_TITLE =
  "Maid Services Cape Town (2026) | Weekly & Domestic Cleaning From R280";

export const MAID_SERVICES_META_DESCRIPTION =
  "Find reliable maid services in Cape Town for weekly or bi-weekly cleaning. From R280. No contracts. Get an instant quote in seconds.";

export const MAID_SERVICES_OG_IMAGE = "/images/marketing/standard-cleaning-cape-town-kitchen.webp";

export function maidServicesHubCanonicalUrl(): string {
  return absoluteCanonicalUrl(MAID_SERVICES_CAPE_TOWN_PATH);
}
