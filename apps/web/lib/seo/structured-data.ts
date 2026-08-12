/**
 * JSON-LD builders for programmatic location hubs — single source for LocalBusiness, Service, FAQPage.
 */

import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";
import { googleBusinessAggregateRatingSchema } from "@/lib/seo/googleReviews";
import { buildPrimaryLocalBusinessBase, capeTownAdministrativeServiceArea } from "@/lib/seo/primaryLocalBusinessJsonLd";
import { getLocationMetaPriceHint } from "@/lib/seo/location-pricing";
import { CUSTOMER_SUPPORT_TELEPHONE_E164 } from "@/lib/site/customerSupport";

/** Bump when refreshing hub copy site-wide (JSON-LD freshness signal). */
export const LOCATION_HUB_SCHEMA_DATE_MODIFIED = "2026-05-15";

export type LocationHubFaqItem = { q: string; a: string };

export type BuildLocationHubJsonLdParams = {
  pageUrl: string;
  locationsIndexUrl: string;
  siteOrigin: string;
  h1: string;
  metaDescription: string;
  location: CapeTownLocationRow;
  faqs: LocationHubFaqItem[];
  /** Nearby programmatic slugs for areaServed enrichment */
  nearbyPlaceNames: readonly { name: string }[];
  /** ISO date — surfaced on WebPage for freshness signals */
  dateModified?: string;
  /** Service entity `name` — defaults to `h1` when omitted */
  serviceSchemaName?: string;
  /** When set, `Service.areaServed` is a single Place with this name (suburb-focused clarity). */
  serviceAreaServedSimpleName?: string;
  /** Optional indicative price band on the primary `Service` node (location/money pages). */
  serviceOffers?: { priceCurrency: string; lowPrice: string; highPrice: string };
};

/** Schema.org graph for `/locations/[slug]` — WebPage, BreadcrumbList, LocalBusiness, Service, FAQPage. */
export function buildLocationHubJsonLd(params: BuildLocationHubJsonLdParams): Record<string, unknown> {
  const {
    pageUrl,
    locationsIndexUrl,
    siteOrigin,
    h1,
    metaDescription,
    location,
    faqs,
    nearbyPlaceNames,
    dateModified = LOCATION_HUB_SCHEMA_DATE_MODIFIED,
    serviceSchemaName,
    serviceAreaServedSimpleName,
    serviceOffers,
  } = params;

  const serviceName = (serviceSchemaName ?? h1).trim() || h1;

  const localBusinessId = `${pageUrl}#localbusiness`;
  const primaryPlaceLabel = `${location.name}, Western Cape, South Africa`;
  const cityPlace = { "@type": "City", name: location.city };
  const areaServedPlaces = [
    {
      "@type": "Place",
      name: primaryPlaceLabel,
      containedInPlace: cityPlace,
    },
    ...nearbyPlaceNames.slice(0, 5).map((loc) => ({
      "@type": "Place",
      name: `${loc.name}, Western Cape, South Africa`,
      containedInPlace: cityPlace,
    })),
  ];
  const primaryLocalBusiness = buildPrimaryLocalBusinessBase();

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${pageUrl}#webpage`,
        name: h1,
        description: metaDescription,
        url: pageUrl,
        dateModified,
        isPartOf: { "@type": "WebSite", name: "Shalean Cleaning Services", url: siteOrigin },
        mainEntityOfPage: { "@id": `${pageUrl}#service` },
        mainEntity: { "@id": `${pageUrl}#service` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${pageUrl}#breadcrumbs`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: siteOrigin },
          { "@type": "ListItem", position: 2, name: "Locations", item: locationsIndexUrl },
          { "@type": "ListItem", position: 3, name: location.name, item: pageUrl },
        ],
      },
      {
        ...primaryLocalBusiness,
        "@id": localBusinessId,
        url: siteOrigin,
        telephone: CUSTOMER_SUPPORT_TELEPHONE_E164,
        priceRange: getLocationMetaPriceHint(location),
        areaServed: areaServedPlaces,
        aggregateRating: googleBusinessAggregateRatingSchema(),
      },
      {
        "@type": "Service",
        "@id": `${pageUrl}#service`,
        name: serviceName,
        serviceType: "Cleaning services",
        url: pageUrl,
        areaServed:
          serviceAreaServedSimpleName ?
            { "@type": "Place", name: serviceAreaServedSimpleName }
          : { "@type": "Place", name: primaryPlaceLabel, containedInPlace: cityPlace },
        serviceArea: capeTownAdministrativeServiceArea(),
        provider: { "@id": localBusinessId },
        ...(serviceOffers ?
          {
            offers: {
              "@type": "Offer",
              priceCurrency: serviceOffers.priceCurrency,
              lowPrice: serviceOffers.lowPrice,
              highPrice: serviceOffers.highPrice,
              availability: "https://schema.org/InStock",
            },
          }
        : {}),
      },
      {
        "@type": "FAQPage",
        "@id": `${pageUrl}#faq`,
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };
}
