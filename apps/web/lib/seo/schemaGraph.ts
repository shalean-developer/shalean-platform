import { PRIMARY_LOCAL_BUSINESS_ID } from "@/lib/seo/primaryLocalBusinessJsonLd";
import { SITE_ORIGIN } from "@/lib/site/canonical";

/** Stable site entity — referenced by WebPage.isPartOf across templates. */
export const SITE_WEBSITE_ID = `${SITE_ORIGIN}/#website`;

const SEARCH_TERM_TOKEN = "{search_term_string}";

function webSiteSearchPotentialAction(): Record<string, unknown> | null {
  const target = process.env.NEXT_PUBLIC_SITE_SEARCH_ACTION_TARGET?.trim();
  if (!target || !target.includes(SEARCH_TERM_TOKEN)) return null;
  return {
    "@type": "SearchAction",
    target,
    "query-input": "required name=search_term_string",
  };
}

export type WebSiteJsonLdOptions = {
  /**
   * Homepage graph only — adds `potentialAction` when `NEXT_PUBLIC_SITE_SEARCH_ACTION_TARGET` is set
   * (must include `{search_term_string}`). Omit until an on-site search URL exists.
   */
  includeSearchAction?: boolean;
};

export function buildWebSiteJsonLdNode(opts?: WebSiteJsonLdOptions): Record<string, unknown> {
  const node: Record<string, unknown> = {
    "@type": "WebSite",
    "@id": SITE_WEBSITE_ID,
    url: SITE_ORIGIN,
    name: "Shalean Cleaning Services",
    publisher: { "@id": PRIMARY_LOCAL_BUSINESS_ID },
  };
  if (opts?.includeSearchAction) {
    const search = webSiteSearchPotentialAction();
    if (search) node.potentialAction = search;
  }
  return node;
}

type WebPageGraphArgs = {
  canonicalUrl: string;
  name: string;
  description?: string;
  /** @id of the primary entity for this URL (Service, OfferCatalog, etc.) */
  primaryEntityId?: string;
  /** Passed to `SpeakableSpecification.cssSelector` when non-empty. */
  speakableCssSelectors?: string[];
};

export function buildWebPageJsonLdNode(args: WebPageGraphArgs): Record<string, unknown> {
  const node: Record<string, unknown> = {
    "@type": "WebPage",
    "@id": `${args.canonicalUrl}#webpage`,
    url: args.canonicalUrl,
    name: args.name,
    isPartOf: { "@id": SITE_WEBSITE_ID },
    about: { "@id": PRIMARY_LOCAL_BUSINESS_ID },
  };
  if (args.description) node.description = args.description;
  if (args.primaryEntityId) {
    const ref = { "@id": args.primaryEntityId };
    node.mainEntityOfPage = ref;
    node.mainEntity = ref;
  }
  if (args.speakableCssSelectors?.length) {
    node.speakable = {
      "@type": "SpeakableSpecification",
      cssSelector: args.speakableCssSelectors,
    };
  }
  return node;
}

export function buildBreadcrumbJsonLdNode(
  pageCanonicalUrl: string,
  items: readonly { readonly name: string; readonly url: string }[],
): Record<string, unknown> {
  return {
    "@type": "BreadcrumbList",
    "@id": `${pageCanonicalUrl}#breadcrumbs`,
    itemListElement: items.map((it, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

export function jsonLdGraphDocument(nodes: unknown[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@graph": nodes,
  };
}
