const localBusinessJsonLd = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "@id": "https://www.shalean.co.za/#localbusiness",
  name: "Shalean Cleaning Services",
  url: "https://www.shalean.co.za/",
  telephone: "+27 21 555 0123",
  email: "hello@shaleancleaning.com",
  image: "https://www.shalean.co.za/icon-512.png",
  priceRange: "R300+",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Cape Town",
    addressRegion: "Western Cape",
    addressCountry: "ZA",
  },
  areaServed: [
    { "@type": "City", name: "Cape Town" },
    { "@type": "Place", name: "Claremont" },
    { "@type": "Place", name: "Rondebosch" },
    { "@type": "Place", name: "Wynberg" },
  ],
  serviceType: [
    "Standard home cleaning",
    "Deep cleaning",
    "Airbnb cleaning",
    "Move-in cleaning",
    "Move-out cleaning",
    "Carpet cleaning",
  ],
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.9",
    reviewCount: "500",
  },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How long does cleaning take?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Most standard cleans for a two-bedroom home take two to three hours. Deep and move cleans run longer because they tackle build-up, fixtures, and hard-to-reach areas.",
      },
    },
    {
      "@type": "Question",
      name: "Do I need to be home?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. Many customers leave a lockbox or remote access instructions. You can also choose a slot when you are available.",
      },
    },
    {
      "@type": "Question",
      name: "What is included?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Standard visits cover dusting reachable surfaces, vacuuming and mopping floors, sanitising bathrooms, and refreshing kitchens. Deep, move, and Airbnb packages extend that scope.",
      },
    },
    {
      "@type": "Question",
      name: "Do cleaners bring supplies?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Teams arrive with professional-grade products and equipment. You can request hypoallergenic options or ask cleaners to use your supplies in the booking notes.",
      },
    },
  ],
};

export function HomeStructuredData() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
    </>
  );
}
