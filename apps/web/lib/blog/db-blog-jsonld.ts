import type { BlogContentJson } from "./content-json";
import type { BlogFaqItem } from "./content-json";

const SITE = "https://www.shalean.co.za";
const ORGANIZATION_LOGO_ABSOLUTE = `${SITE}/images/marketing/cape-town-house-cleaning-kitchen.webp`;

export function collectFaqItemsFromContent(content: BlogContentJson): BlogFaqItem[] {
  const out: BlogFaqItem[] = [];
  for (const block of content.blocks) {
    if (block.type === "faq") {
      out.push(...block.items);
    }
  }
  return out;
}

export function absoluteUrlFromCanonicalPath(canonicalPath: string): string {
  if (canonicalPath.startsWith("http://") || canonicalPath.startsWith("https://")) {
    return canonicalPath;
  }
  const path = canonicalPath.startsWith("/") ? canonicalPath : `/${canonicalPath}`;
  return `${SITE}${path}`;
}

export function buildDbBlogPostingJsonLd(params: {
  headline: string;
  description: string;
  publishedAt: string;
  dateModified: string;
  pageUrl: string;
  imageUrls: string[];
}) {
  return {
    "@type": "BlogPosting",
    headline: params.headline,
    description: params.description,
    datePublished: params.publishedAt,
    dateModified: params.dateModified,
    image: params.imageUrls,
    author: {
      "@type": "Organization",
      name: "Shalean Cleaning Services",
    },
    publisher: {
      "@type": "Organization",
      name: "Shalean Cleaning Services",
      url: SITE,
      logo: {
        "@type": "ImageObject",
        url: ORGANIZATION_LOGO_ABSOLUTE,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": params.pageUrl,
    },
  };
}

export function buildDbBreadcrumbJsonLd(params: { pageUrl: string; title: string }) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE}/blog` },
      { "@type": "ListItem", position: 3, name: params.title, item: params.pageUrl },
    ],
  };
}

export function buildDbFaqJsonLd(items: BlogFaqItem[]): Record<string, unknown> | null {
  if (items.length === 0) return null;
  return {
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function buildDbBlogGraphJsonLd(params: {
  headline: string;
  description: string;
  publishedAt: string;
  dateModified: string;
  pageUrl: string;
  imageUrls: string[];
  faqItems: BlogFaqItem[];
}) {
  const graph: Record<string, unknown>[] = [
    buildDbBlogPostingJsonLd({
      headline: params.headline,
      description: params.description,
      publishedAt: params.publishedAt,
      dateModified: params.dateModified,
      pageUrl: params.pageUrl,
      imageUrls: params.imageUrls,
    }),
    buildDbBreadcrumbJsonLd({ pageUrl: params.pageUrl, title: params.headline }),
  ];
  const faqLd = buildDbFaqJsonLd(params.faqItems);
  if (faqLd) graph.push(faqLd);
  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}
