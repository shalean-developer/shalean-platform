import { ABOUT_REVIEWS } from "@/lib/about/about-page-content";
import {
  buildPrimaryLocalBusinessMoneyPageNode,
  PRIMARY_LOCAL_BUSINESS_ID,
} from "@/lib/seo/primaryLocalBusinessJsonLd";
import { SITE_ORIGIN } from "@/lib/site/canonical";

const REVIEWS_URL = `${SITE_ORIGIN}/reviews`;

/** WebPage + LocalBusiness with curated Review nodes for `/reviews`. */
export function buildReviewsPageJsonLd(): Record<string, unknown> {
  const localBusiness = {
    ...buildPrimaryLocalBusinessMoneyPageNode(),
    review: ABOUT_REVIEWS.map((r, index) => ({
      "@type": "Review",
      "@id": `${REVIEWS_URL}#review-${index + 1}`,
      reviewRating: {
        "@type": "Rating",
        ratingValue: "5",
        bestRating: "5",
      },
      author: { "@type": "Person", name: r.author },
      reviewBody: r.quote,
      itemReviewed: { "@type": "LocalBusiness", name: "Shalean Cleaning Services" },
    })),
  };

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${REVIEWS_URL}#webpage`,
        name: "Google Reviews | Shalean Cleaning Services Cape Town",
        url: REVIEWS_URL,
        isPartOf: { "@type": "WebSite", name: "Shalean Cleaning Services", url: SITE_ORIGIN },
        about: { "@id": PRIMARY_LOCAL_BUSINESS_ID },
      },
      localBusiness,
    ],
  };
}
