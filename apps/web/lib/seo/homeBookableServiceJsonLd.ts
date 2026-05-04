import { SITE_ORIGIN } from "@/lib/site/canonical";

/** Homepage `OfferCatalog` — referenced from LocalBusiness `hasOfferCatalog`. */
export const HOME_PAGE_OFFER_CATALOG_ID = `${SITE_ORIGIN}/#offer-catalog`;

/** Stable fragment for homepage bookable services (`HomeService.id` / widget keys). */
export function homeBookableServiceJsonLdId(widgetServiceId: string): string {
  return `${SITE_ORIGIN}/#service-${widgetServiceId}`;
}
