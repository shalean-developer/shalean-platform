import { googleBusinessAggregateRatingSchema } from "@/lib/seo/googleReviews";
import { SITE_ORIGIN } from "@/lib/site/canonical";
import { CUSTOMER_SUPPORT_EMAIL, CUSTOMER_SUPPORT_TELEPHONE_E164 } from "@/lib/site/customerSupport";
import { getBrandSameAsForJsonLd } from "@/lib/site/brandSameAs";

/** Stable @id aligned with homepage — reuse on hub pages so Google maps one primary entity. */
export const PRIMARY_LOCAL_BUSINESS_ID = `${SITE_ORIGIN}/#localbusiness`;

/** Representative image for LocalBusiness (logo asset not in public/ — uses verified marketing hero). */
export const PRIMARY_LOCAL_BUSINESS_IMAGE = `${SITE_ORIGIN}/images/marketing/cape-town-house-cleaning-kitchen.webp`;

const CAPE_TOWN_CITY = {
  "@type": "City",
  name: "Cape Town",
  containedInPlace: { "@type": "Country", name: "South Africa" },
} as const;

/** Approximate coords for registered Claremont address (39 Harvey Rd) — LocalBusiness `geo`. */
const PRIMARY_BUSINESS_GEO = {
  "@type": "GeoCoordinates",
  latitude: -33.9768,
  longitude: 18.4686,
} as const;

/**
 * Core LocalBusiness node for Shalean — used on homepage graph and standalone on money pages.
 * Telephone/email match `customerSupport` (single source of truth).
 */
export function buildPrimaryLocalBusinessBase(): Record<string, unknown> {
  const node: Record<string, unknown> = {
    "@type": "LocalBusiness",
    "@id": PRIMARY_LOCAL_BUSINESS_ID,
    name: "Shalean Cleaning Services",
    image: [PRIMARY_LOCAL_BUSINESS_IMAGE],
    url: SITE_ORIGIN,
    telephone: CUSTOMER_SUPPORT_TELEPHONE_E164,
    email: CUSTOMER_SUPPORT_EMAIL,
    /** ZAR entry bands + moderate tier hint for rich results. */
    priceRange: "$$ - From R280",
    openingHours: "Mo-Su 08:00-18:00",
    address: {
      "@type": "PostalAddress",
      streetAddress: "39 Harvey Rd",
      addressLocality: "Claremont",
      addressRegion: "Western Cape",
      postalCode: "7708",
      addressCountry: "ZA",
    },
    geo: { ...PRIMARY_BUSINESS_GEO },
    aggregateRating: googleBusinessAggregateRatingSchema(),
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
    { ...CAPE_TOWN_CITY },
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

/** Explicit local service region on `Service` / `CleaningService` nodes (alongside `areaServed`). */
export function capeTownAdministrativeServiceArea(): Record<string, unknown> {
  return { "@type": "AdministrativeArea", name: "Cape Town" };
}
