import { buildPrimaryLocalBusinessBase, PRIMARY_LOCAL_BUSINESS_ID } from "@/lib/seo/primaryLocalBusinessJsonLd";
import { absoluteCanonicalUrl, SITE_ORIGIN } from "@/lib/site/canonical";

export type MarketingWebPageJsonLdParams = {
  /** Canonical path, e.g. `/privacy-policy`. */
  path: string;
  /** WebPage `name` — usually the page `<title>`. */
  name: string;
  /** Meta description reused as WebPage `description`. */
  description: string;
  /** Trailing breadcrumb label (Home → label). */
  breadcrumbLabel: string;
  /** schema.org WebPage subtype; defaults to `WebPage`. */
  webPageType?: string;
  /** Embed the primary LocalBusiness node and link it via `about` (lead-gen pages). */
  includeLocalBusinessNode?: boolean;
};

/**
 * Minimal `WebPage` + `BreadcrumbList` graph for simple marketing/legal pages
 * that don't warrant richer schema. Mirrors {@link buildContactPageJsonLdGraph}.
 */
export function buildMarketingWebPageJsonLd(params: MarketingWebPageJsonLdParams): Record<string, unknown> {
  const { path, name, description, breadcrumbLabel, webPageType = "WebPage", includeLocalBusinessNode = false } = params;
  const url = absoluteCanonicalUrl(path);

  const webPage: Record<string, unknown> = {
    "@type": webPageType,
    "@id": `${url}#webpage`,
    url,
    name,
    description,
    isPartOf: { "@type": "WebSite", name: "Shalean Cleaning Services", url: SITE_ORIGIN },
    breadcrumb: { "@id": `${url}#breadcrumbs` },
  };
  if (includeLocalBusinessNode) {
    webPage.about = { "@id": PRIMARY_LOCAL_BUSINESS_ID };
  }

  const graph: Record<string, unknown>[] = [
    webPage,
    {
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumbs`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_ORIGIN },
        { "@type": "ListItem", position: 2, name: breadcrumbLabel, item: url },
      ],
    },
  ];
  if (includeLocalBusinessNode) {
    graph.push(buildPrimaryLocalBusinessBase());
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}
