import {
  buildPrimaryLocalBusinessMoneyPageNode,
  PRIMARY_LOCAL_BUSINESS_ID,
} from "@/lib/seo/primaryLocalBusinessJsonLd";
import { SITE_ORIGIN } from "@/lib/site/canonical";

import { reviewsPagePath } from "@/lib/reviews/reviewPagination";

/** Business identity only; never manufacture Review nodes from marketing copy. */
export function buildReviewsPageJsonLd(page = 1): Record<string, unknown> {
  const REVIEWS_URL = `${SITE_ORIGIN}${reviewsPagePath(page)}`;
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
        breadcrumb: { "@id": `${REVIEWS_URL}#breadcrumb` },
      },
      {
        "@type": "BreadcrumbList", "@id": `${REVIEWS_URL}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE_ORIGIN },
          { "@type": "ListItem", position: 2, name: "Customer reviews", item: REVIEWS_URL },
        ],
      },
      localBusiness,
    ],
  };
}
