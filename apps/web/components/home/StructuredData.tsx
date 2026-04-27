import type { HomeFaq, HomeLocation, HomeService } from "@/lib/home/data";
import {
  CUSTOMER_SUPPORT_EMAIL,
  CUSTOMER_SUPPORT_TELEPHONE_E164,
} from "@/lib/site/customerSupport";

type StructuredDataProps = {
  services: HomeService[];
  locations: HomeLocation[];
  faqs: HomeFaq[];
};

const SITE_URL = "https://www.shalean.co.za";
const LOCAL_BUSINESS_ID = `${SITE_URL}/#localbusiness`;

/** Primary service labels for Google rich results (aligned with CleaningService). */
const CORE_SERVICE_TYPES = ["house cleaning", "deep cleaning", "move-out cleaning"] as const;

export function StructuredData({ services, locations, faqs }: StructuredDataProps) {
  const areaServed = [
    { "@type": "Country" as const, name: "South Africa" },
    ...locations.map((location) => ({
      "@type": "Place" as const,
      name: location.city ? `${location.name}, ${location.city}` : location.name,
    })),
  ];

  const localBusiness = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": LOCAL_BUSINESS_ID,
    name: "Shalean Cleaning Services",
    url: SITE_URL,
    telephone: CUSTOMER_SUPPORT_TELEPHONE_E164,
    email: CUSTOMER_SUPPORT_EMAIL,
    address: {
      "@type": "PostalAddress",
      addressCountry: "ZA",
      addressRegion: "Western Cape",
      addressLocality: "Cape Town",
    },
    areaServed,
    serviceType: [...CORE_SERVICE_TYPES],
    makesOffer: services.map((service) => ({
      "@type": "Offer",
      itemOffered: {
        "@type": "Service",
        name: service.title,
        description: service.description,
      },
      priceCurrency: "ZAR",
      ...(service.price != null ? { price: service.price } : {}),
    })),
  };

  const cleaningService = {
    "@context": "https://schema.org",
    "@type": "CleaningService",
    "@id": `${SITE_URL}/#cleaningservice`,
    name: "Shalean Cleaning Services",
    url: SITE_URL,
    serviceType: [...CORE_SERVICE_TYPES],
    areaServed,
    provider: { "@id": LOCAL_BUSINESS_ID },
  };

  const serviceSchema = services.map((service) => ({
    "@context": "https://schema.org",
    "@type": "Service",
    name: service.title,
    description: service.description,
    areaServed: locations.map((location) => location.name),
    provider: { "@id": LOCAL_BUSINESS_ID },
  }));

  const faqSchema =
    faqs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((faq) => ({
            "@type": "Question",
            name: faq.question,
            acceptedAnswer: {
              "@type": "Answer",
              text: faq.answer,
            },
          })),
        }
      : null;

  const graphs = [localBusiness, cleaningService, ...serviceSchema, faqSchema].filter(Boolean);

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graphs).replace(/</g, "\\u003c") }}
    />
  );
}

export default StructuredData;
