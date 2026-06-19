import type { HomeFaq, HomeLocation, MarketingHomeService } from "@/lib/home/data";
import {
  buildPrimaryLocalBusinessBase,
  capeTownAdministrativeServiceArea,
  PRIMARY_LOCAL_BUSINESS_ID,
} from "@/lib/seo/primaryLocalBusinessJsonLd";
import { HOME_PAGE_OFFER_CATALOG_ID, homeBookableServiceJsonLdId } from "@/lib/seo/homeBookableServiceJsonLd";
import {
  HOME_CANONICAL,
  HOME_PAGE_HEADLINE,
  HOME_PAGE_META_DESCRIPTION,
  HOME_PAGE_TITLE,
} from "@/lib/seo/homePageMeta";
import { normalizeSchemaDescription } from "@/lib/seo/metaDescription";
import { buildWebPageJsonLdNode, buildWebSiteJsonLdNode, pageEntityId } from "@/lib/seo/schemaGraph";
import { SITE_ORIGIN } from "@/lib/site/canonical";

type StructuredDataProps = {
  services: MarketingHomeService[];
  locations: HomeLocation[];
  faqs: HomeFaq[];
};

/** Primary service labels for Google rich results (aligned with CleaningService). */
const CORE_SERVICE_TYPES = ["house cleaning", "deep cleaning", "move-out cleaning"] as const;

const CLEANING_SERVICE_ID = `${SITE_ORIGIN}/#cleaningservice`;

const CAPE_TOWN_HOME_CITY = {
  "@type": "City",
  name: "Cape Town",
  containedInPlace: { "@type": "Country", name: "South Africa" },
} as const;

function buildHomeOfferCatalog(services: MarketingHomeService[]): Record<string, unknown> {
  return {
    "@type": "OfferCatalog",
    "@id": HOME_PAGE_OFFER_CATALOG_ID,
    name: "Cleaning services",
    url: SITE_ORIGIN,
    itemListElement: services.map((service, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          "@id": homeBookableServiceJsonLdId(service.id),
        },
        priceCurrency: "ZAR",
        ...(service.price != null ? { price: service.price } : {}),
      },
    })),
  };
}

export function StructuredData({ services, locations, faqs }: StructuredDataProps) {
  const locationPlaceRows = locations.map((location) => ({
    "@type": "Place" as const,
    name: location.city ? `${location.name}, ${location.city}` : location.name,
  }));

  /** Always anchor Cape Town metro even if CMS location rows change. */
  const areaServed = [
    { "@type": "Country" as const, name: "South Africa" },
    CAPE_TOWN_HOME_CITY,
    ...locationPlaceRows,
  ];

  const locationPlaces: unknown[] = [
    CAPE_TOWN_HOME_CITY,
    ...(locationPlaceRows.length > 0 ? locationPlaceRows : [{ "@type": "Country" as const, name: "South Africa" }]),
  ];

  const offerCatalogNode = buildHomeOfferCatalog(services);

  const localBusiness: Record<string, unknown> = {
    ...buildPrimaryLocalBusinessBase(),
    areaServed,
    serviceType: [...CORE_SERVICE_TYPES],
    hasOfferCatalog: { "@id": HOME_PAGE_OFFER_CATALOG_ID },
  };

  const cleaningService = {
    "@type": "CleaningService",
    "@id": CLEANING_SERVICE_ID,
    name: "Shalean Cleaning Services",
    url: SITE_ORIGIN,
    serviceType: [...CORE_SERVICE_TYPES],
    areaServed,
    serviceArea: capeTownAdministrativeServiceArea(),
    provider: { "@id": PRIMARY_LOCAL_BUSINESS_ID },
  };

  const serviceNodes = services.map((service) => ({
    "@type": "Service",
    "@id": homeBookableServiceJsonLdId(service.id),
    name: service.title,
    description: normalizeSchemaDescription(service.description),
    url: SITE_ORIGIN,
    areaServed: locationPlaces,
    serviceArea: capeTownAdministrativeServiceArea(),
    provider: { "@id": PRIMARY_LOCAL_BUSINESS_ID },
  }));

  const graph: unknown[] = [
    buildWebSiteJsonLdNode({ includeSearchAction: true }),
    buildWebPageJsonLdNode({
      canonicalUrl: HOME_CANONICAL,
      name: HOME_PAGE_HEADLINE,
      description: HOME_PAGE_META_DESCRIPTION,
      primaryEntityId: CLEANING_SERVICE_ID,
      speakableCssSelectors: ["main h1", ".marketing-hero-lead"],
    }),
    localBusiness,
    offerCatalogNode,
    cleaningService,
    ...serviceNodes,
  ];

  if (faqs.length > 0) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${SITE_ORIGIN}/#faq`,
      url: SITE_ORIGIN,
      isPartOf: { "@id": pageEntityId(HOME_CANONICAL, "webpage") },
      about: { "@id": PRIMARY_LOCAL_BUSINESS_ID },
      mainEntity: faqs.map((faq, index) => ({
        "@type": "Question",
        "@id": `${SITE_ORIGIN}/#faq-q-${index + 1}`,
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer,
        },
      })),
    });
  }

  const payload = {
    "@context": "https://schema.org",
    "@graph": graph,
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(payload).replace(/</g, "\\u003c") }}
    />
  );
}

export default StructuredData;
