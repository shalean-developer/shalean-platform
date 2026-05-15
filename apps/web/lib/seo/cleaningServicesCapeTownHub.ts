import { clampMetaDescription } from "@/lib/seo/metaDescription";
import {
  buildBreadcrumbJsonLdNode,
  buildWebPageJsonLdNode,
  buildWebSiteJsonLdNode,
  jsonLdGraphDocument,
} from "@/lib/seo/schemaGraph";
import {
  buildPrimaryLocalBusinessMoneyPageNode,
  capeTownAdministrativeServiceArea,
  PRIMARY_LOCAL_BUSINESS_ID,
} from "@/lib/seo/primaryLocalBusinessJsonLd";
import { absoluteCanonicalUrl, SITE_ORIGIN } from "@/lib/site/canonical";

export const CLEANING_SERVICES_CAPE_TOWN_HUB_PATH = "/cleaning-services-cape-town";

export const CLEANING_SERVICES_CAPE_TOWN_HUB_DESCRIPTION = clampMetaDescription(
  "Book reliable cleaning services in Cape Town. Trusted cleaners, flexible scheduling, and instant quotes for homes, apartments, and Airbnb properties.",
);

/** Shared with FAQ UI + FAQPage JSON-LD on the city cleaning hub. */
export const CLEANING_SERVICES_CAPE_TOWN_HUB_FAQS = [
  {
    idSlug: "cost-cape-town",
    question: "How much does cleaning cost in Cape Town?",
    answer:
      "Cleaning prices in Cape Town depend on home size, bathrooms, and the service you pick (standard, deep, move-out, or Airbnb). Start an instant quote to see live pricing for your address—no payment until you confirm scope.",
  },
  {
    idSlug: "supplies",
    question: "Do cleaners bring their own supplies?",
    answer:
      "Yes. Teams arrive with the products and equipment needed for the booked checklist. Add notes at checkout if you prefer specific products or have sensitivities.",
  },
  {
    idSlug: "duration",
    question: "How long does cleaning take?",
    answer:
      "Visit length depends on property size and service tier. Standard cleans are typically a half-day session; deep and move-out cleans take longer. Your quote estimates time based on the rooms you select.",
  },
  {
    idSlug: "how-book",
    question: "How do I book a cleaner?",
    answer:
      "Choose a service, enter your Cape Town address and rooms, pick a date, then checkout online. You will see transparent pricing before you pay, and you can reschedule when plans change.",
  },
  {
    idSlug: "suburbs",
    question: "Which Cape Town suburbs do you serve?",
    answer:
      "We serve suburbs across the city—from Claremont and Rondebosch to Sea Point, the City Bowl, and the Northern Suburbs. Use suburb guides above or confirm coverage at checkout with your full address.",
  },
] as const;

function buildCleaningServicesHubFaqJsonLd(pageUrl: string): Record<string, unknown> {
  return {
    "@type": "FAQPage",
    "@id": `${pageUrl}#faq`,
    url: pageUrl,
    isPartOf: { "@id": `${pageUrl}#webpage` },
    about: { "@id": PRIMARY_LOCAL_BUSINESS_ID },
    mainEntity: CLEANING_SERVICES_CAPE_TOWN_HUB_FAQS.map((item) => ({
      "@type": "Question",
      "@id": `${pageUrl}#faq-q-${item.idSlug}`,
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

/** WebPage + LocalBusiness + Service + FAQPage — strengthens entity signals for the city money hub. */
export function buildCleaningServicesCapeTownHubJsonLd(): Record<string, unknown> {
  const pageUrl = absoluteCanonicalUrl(CLEANING_SERVICES_CAPE_TOWN_HUB_PATH);
  const serviceId = `${pageUrl}#primary-service`;
  return jsonLdGraphDocument([
    buildWebSiteJsonLdNode(),
    buildWebPageJsonLdNode({
      canonicalUrl: pageUrl,
      name: "Cleaning services in Cape Town",
      description: CLEANING_SERVICES_CAPE_TOWN_HUB_DESCRIPTION,
      primaryEntityId: serviceId,
      speakableCssSelectors: ["main h1"],
    }),
    buildPrimaryLocalBusinessMoneyPageNode(),
    {
      "@type": "Service",
      "@id": serviceId,
      name: "House cleaning services in Cape Town",
      serviceType: "Cleaning services",
      url: pageUrl,
      areaServed: { "@type": "City", name: "Cape Town", containedInPlace: { "@type": "Country", name: "South Africa" } },
      serviceArea: capeTownAdministrativeServiceArea(),
      provider: { "@id": PRIMARY_LOCAL_BUSINESS_ID },
    },
    buildCleaningServicesHubFaqJsonLd(pageUrl),
    buildBreadcrumbJsonLdNode(pageUrl, [
      { name: "Home", url: SITE_ORIGIN },
      { name: "Cleaning services in Cape Town", url: pageUrl },
    ]),
  ]);
}

export function cleaningServicesCapeTownHubJsonLdScriptContent(): string {
  try {
    return JSON.stringify(buildCleaningServicesCapeTownHubJsonLd()).replace(/</g, "\\u003c");
  } catch {
    return "{}";
  }
}
