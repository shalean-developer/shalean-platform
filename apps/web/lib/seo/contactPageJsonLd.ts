import { buildPrimaryLocalBusinessBase } from "@/lib/seo/primaryLocalBusinessJsonLd";
import { clampMetaDescription } from "@/lib/seo/metaDescription";
import { absoluteCanonicalUrl, SITE_ORIGIN } from "@/lib/site/canonical";
import {
  CUSTOMER_SUPPORT_EMAIL,
  CUSTOMER_SUPPORT_TELEPHONE_E164,
  CUSTOMER_SUPPORT_TELEPHONE_DISPLAY,
} from "@/lib/site/customerSupport";

const CONTACT_PATH = "/contact";
const CONTACT_URL = absoluteCanonicalUrl(CONTACT_PATH);

const CONTACT_PAGE_DESCRIPTION = clampMetaDescription(
  "Contact Shalean Cleaning Services in Cape Town by phone, WhatsApp, or email for booking help, quotes, and customer support.",
);

/** ContactPage + LocalBusiness contactPoint for `/contact`. */
export function buildContactPageJsonLdGraph(): Record<string, unknown> {
  const localBusiness = buildPrimaryLocalBusinessBase();
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ContactPage",
        "@id": `${CONTACT_URL}#webpage`,
        url: CONTACT_URL,
        name: "Contact Shalean Cleaning Services Cape Town",
        description: CONTACT_PAGE_DESCRIPTION,
        isPartOf: { "@type": "WebSite", name: "Shalean Cleaning Services", url: SITE_ORIGIN },
        breadcrumb: { "@id": `${CONTACT_URL}#breadcrumbs` },
        mainEntity: { "@id": `${SITE_ORIGIN}/#localbusiness` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${CONTACT_URL}#breadcrumbs`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE_ORIGIN },
          { "@type": "ListItem", position: 2, name: "Contact", item: CONTACT_URL },
        ],
      },
      {
        ...localBusiness,
        contactPoint: [
          {
            "@type": "ContactPoint",
            contactType: "customer service",
            telephone: CUSTOMER_SUPPORT_TELEPHONE_E164,
            email: CUSTOMER_SUPPORT_EMAIL,
            areaServed: { "@type": "Country", name: "South Africa" },
            availableLanguage: ["English", "Afrikaans"],
            hoursAvailable: {
              "@type": "OpeningHoursSpecification",
              dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
              opens: "08:00",
              closes: "18:00",
            },
          },
        ],
        description: `Reach Shalean on ${CUSTOMER_SUPPORT_TELEPHONE_DISPLAY} or ${CUSTOMER_SUPPORT_EMAIL} for Cape Town cleaning bookings and support.`,
      },
    ],
  };
}
