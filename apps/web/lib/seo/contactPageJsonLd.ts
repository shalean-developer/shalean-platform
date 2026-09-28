import { buildPrimaryLocalBusinessBase } from "@/lib/seo/primaryLocalBusinessJsonLd";
import { clampMetaDescription } from "@/lib/seo/metaDescription";
import { absoluteCanonicalUrl, SITE_ORIGIN } from "@/lib/site/canonical";
import {
  CUSTOMER_SUPPORT_TELEPHONE_E164,
  CUSTOMER_SUPPORT_TELEPHONE_DISPLAY,
} from "@/lib/site/customerSupport";
import {
  PUBLIC_BUSINESS_EMAIL,
  PUBLIC_BUSINESS_OPENING_HOURS_SPECIFICATION,
  PUBLIC_BUSINESS_SERVICE_AREA,
} from "@/lib/site/publicBusinessIdentity";

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
            email: PUBLIC_BUSINESS_EMAIL,
            areaServed: { ...PUBLIC_BUSINESS_SERVICE_AREA },
            availableLanguage: ["English", "Afrikaans"],
            hoursAvailable: { ...PUBLIC_BUSINESS_OPENING_HOURS_SPECIFICATION },
          },
        ],
        description: `Reach Shalean on ${CUSTOMER_SUPPORT_TELEPHONE_DISPLAY} or ${PUBLIC_BUSINESS_EMAIL} for Cape Town cleaning bookings and support.`,
      },
    ],
  };
}
