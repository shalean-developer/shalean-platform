import {
  buildPrimaryLocalBusinessMoneyPageNode,
  PRIMARY_LOCAL_BUSINESS_ID,
} from "@/lib/seo/primaryLocalBusinessJsonLd";
import { SITE_ORIGIN } from "@/lib/site/canonical";

const REVIEWS_URL = `${SITE_ORIGIN}/reviews`;

/** Business identity only; never manufacture Review nodes from marketing copy. */
export function buildReviewsPageJsonLd(): Record<string, unknown> {
  const localBusiness = buildPrimaryLocalBusinessMoneyPageNode();

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${REVIEWS_URL}#webpage`,
        name: "Customer Reviews | Shalean Cleaning Services Cape Town",
        url: REVIEWS_URL,
        isPartOf: { "@type": "WebSite", name: "Shalean Cleaning Services", url: SITE_ORIGIN },
        about: { "@id": PRIMARY_LOCAL_BUSINESS_ID },
      },
      localBusiness,
    ],
  };
}
