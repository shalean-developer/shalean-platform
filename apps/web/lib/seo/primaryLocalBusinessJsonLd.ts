import { HOME_STARTING_PRICE_ZAR } from "@/lib/seo/homePageMeta";
import { SITE_ORIGIN } from "@/lib/site/canonical";
import { CUSTOMER_SUPPORT_TELEPHONE_E164 } from "@/lib/site/customerSupport";
import {
  PUBLIC_BUSINESS_ADDRESS,
  PUBLIC_BUSINESS_EMAIL,
  PUBLIC_BUSINESS_NAME,
  PUBLIC_BUSINESS_OPENING_HOURS,
  PUBLIC_BUSINESS_OPENING_HOURS_SPECIFICATION,
  PUBLIC_BUSINESS_SERVICE_AREA,
} from "@/lib/site/publicBusinessIdentity";
import { getBrandSameAsForJsonLd } from "@/lib/site/brandSameAs";

/** Stable @id aligned with homepage — reuse on hub pages so Google maps one primary entity. */
export const PRIMARY_LOCAL_BUSINESS_ID = `${SITE_ORIGIN}/#localbusiness`;

/** Representative image for LocalBusiness (logo asset not in public/ — uses verified marketing hero). */
export const PRIMARY_LOCAL_BUSINESS_IMAGE = `${SITE_ORIGIN}/images/marketing/homepage-hero-cleaning-team-cape-town.webp`;

/**
 * Core LocalBusiness node for Shalean — used on homepage graph and standalone on money pages.
 * Name, phone, address and opening hours are aligned to the live Google Business Profile.
 * Unverified approximate geo coordinates are intentionally omitted.
 * Public email is site-owned because GBP does not expose an email field.
 *
 * Do not attach Google Business Profile aggregate ratings here. Those ratings are displayed
 * visibly as third-party trust evidence, but are not Shalean-authored review markup.
 */
export function buildPrimaryLocalBusinessBase(): Record<string, unknown> {
  const node: Record<string, unknown> = {
    "@type": "LocalBusiness",
    "@id": PRIMARY_LOCAL_BUSINESS_ID,
    name: PUBLIC_BUSINESS_NAME,
    image: [PRIMARY_LOCAL_BUSINESS_IMAGE],
    url: SITE_ORIGIN,
    telephone: CUSTOMER_SUPPORT_TELEPHONE_E164,
    email: PUBLIC_BUSINESS_EMAIL,
    /** ZAR entry band aligned with the canonical homepage marketing starting price. */
    priceRange: `$$ - From R${HOME_STARTING_PRICE_ZAR}`,
    openingHours: PUBLIC_BUSINESS_OPENING_HOURS,
    openingHoursSpecification: [{ ...PUBLIC_BUSINESS_OPENING_HOURS_SPECIFICATION }],
    address: {
      "@type": "PostalAddress",
      ...PUBLIC_BUSINESS_ADDRESS,
    },
    areaServed: { ...PUBLIC_BUSINESS_SERVICE_AREA },
    knowsAbout: [
      "House cleaning",
      "Maid services",
      "Deep cleaning",
      "Move-out cleaning",
      "Apartment cleaning",
      "Office cleaning",
      "Airbnb cleaning",
    ],
  };
  const sameAs = getBrandSameAsForJsonLd();
  if (sameAs.length > 0) node.sameAs = sameAs;
  return node;
}

/**
 * Named suburbs for money-page LocalBusiness — mixed City + Place (explicit types).
 * Homepage continues to pass its own richer `areaServed` from live location data.
 */
export function primaryLocalBusinessMoneyPageAreaServed(): unknown[] {
  return [
    { ...PUBLIC_BUSINESS_SERVICE_AREA },
    { "@type": "Place", name: "Claremont" },
    { "@type": "Place", name: "Sea Point" },
    { "@type": "Place", name: "Constantia" },
    { "@type": "Place", name: "Green Point" },
    { "@type": "Place", name: "Rondebosch" },
    { "@type": "Place", name: "Observatory" },
    { "@type": "Place", name: "Woodstock" },
    { "@type": "Place", name: "Newlands" },
    { "@type": "Place", name: "Cape Town CBD" },
  ];
}

/** Full LocalBusiness node for hub templates (merge into a page-level `@graph`). */
export function buildPrimaryLocalBusinessMoneyPageNode(): Record<string, unknown> {
  return {
    ...buildPrimaryLocalBusinessBase(),
    areaServed: primaryLocalBusinessMoneyPageAreaServed(),
  };
}

export function buildPrimaryLocalBusinessStandaloneGraphJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@graph": [buildPrimaryLocalBusinessMoneyPageNode()],
  };
}

/** Explicit local service region on Service nodes (alongside `areaServed`). */
export function capeTownAdministrativeServiceArea(): Record<string, unknown> {
  return {
    ...PUBLIC_BUSINESS_SERVICE_AREA,
    containedInPlace: {
      ...PUBLIC_BUSINESS_SERVICE_AREA.containedInPlace,
      containedInPlace: { ...PUBLIC_BUSINESS_SERVICE_AREA.containedInPlace.containedInPlace },
    },
  };
}
