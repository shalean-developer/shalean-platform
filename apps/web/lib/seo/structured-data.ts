/**
 * JSON-LD builders for programmatic location hubs — single source for LocalBusiness, Service, FAQPage.
 */

import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";
import { googleBusinessAggregateRatingSchema } from "@/lib/seo/googleReviews";
import { capeTownAdministrativeServiceArea } from "@/lib/seo/primaryLocalBusinessJsonLd";
import { getLocationMetaPriceHint } from "@/lib/seo/location-pricing";
import { CUSTOMER_SUPPORT_TELEPHONE_E164 } from "@/lib/site/customerSupport";

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
  } = params;

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

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${pageUrl}#webpage`,
        name: h1,
        description: metaDescription,
        url: pageUrl,
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
        "@type": "LocalBusiness",
        "@id": localBusinessId,
        name: "Shalean Cleaning Services",
        url: siteOrigin,
        telephone: CUSTOMER_SUPPORT_TELEPHONE_E164,
        priceRange: getLocationMetaPriceHint(location),
        areaServed: areaServedPlaces,
        aggregateRating: googleBusinessAggregateRatingSchema(),
      },
      {
        "@type": "Service",
        "@id": `${pageUrl}#service`,
        name: h1,
        serviceType: "Cleaning services",
        url: pageUrl,
        areaServed: { "@type": "Place", name: primaryPlaceLabel, containedInPlace: cityPlace },
        serviceArea: capeTownAdministrativeServiceArea(),
        provider: { "@id": localBusinessId },
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
