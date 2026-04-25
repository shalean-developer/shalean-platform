import type { HomeFaq, HomeLocation, HomeService } from "@/lib/home/data";

type StructuredDataProps = {
  services: HomeService[];
  locations: HomeLocation[];
  faqs: HomeFaq[];
};

export function StructuredData({ services, locations, faqs }: StructuredDataProps) {
  const localBusiness = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "Shalean Cleaning Services",
    url: "https://shalean.co.za",
    areaServed: locations.map((location) => ({
      "@type": "Place",
      name: location.city ? `${location.name}, ${location.city}` : location.name,
    })),
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

  const serviceSchema = services.map((service) => ({
    "@context": "https://schema.org",
    "@type": "Service",
    name: service.title,
    description: service.description,
    areaServed: locations.map((location) => location.name),
    provider: {
      "@type": "LocalBusiness",
      name: "Shalean Cleaning Services",
    },
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

  const graphs = [localBusiness, ...serviceSchema, faqSchema].filter(Boolean);

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graphs).replace(/</g, "\\u003c") }}
    />
  );
}
