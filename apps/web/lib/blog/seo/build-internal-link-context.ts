import type { InjectInternalLinksContext } from "@/lib/blog/seo/inject-internal-links";
import { parseProgrammaticSlugFeatures } from "@/lib/blog/seo/get-related-posts";
import type { SeoInternalLinkContextStored } from "@/lib/blog/seo/seo-internal-link-context-schema";
import { getLocation } from "@/lib/locations";

function titleCaseWords(s: string): string {
  const t = s.trim().replace(/-/g, " ");
  if (!t) return "";
  return t
    .split(/\s+/)
    .map((w) => (w.length <= 2 ? w : w.slice(0, 1).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

function serviceLabelFromSlug(serviceSlug: string): string {
  const base = serviceSlug.replace(/-cape-town$/i, "").replace(/-/g, " ").trim();
  if (!base) return "Home cleaning";
  return titleCaseWords(base);
}

/**
 * Merge stored SEO context (if any) with slug-derived defaults for injectInternalLinks().
 */
export function buildInjectInternalLinksContext(params: {
  slug: string;
  stored: SeoInternalLinkContextStored | null;
  primaryKeyword?: string | null;
  relatedBlogPosts?: { slug: string; title: string }[];
}): InjectInternalLinksContext {
  const postSlug = params.slug;
  if (params.stored) {
    return {
      ...params.stored,
      relatedBlogPosts: params.relatedBlogPosts,
      postSlug,
    };
  }

  const facets = parseProgrammaticSlugFeatures(params.slug);
  const citySlug = facets?.citySlug ?? "cape-town";
  const cityName = citySlug === "cape-town" ? "Cape Town" : titleCaseWords(citySlug);

  let locationSlug = facets?.locationSlug ?? "";
  let locationName = "Cape Town";
  if (locationSlug) {
    const row = getLocation(locationSlug);
    locationName = row?.name ?? titleCaseWords(locationSlug);
  } else {
    locationName = cityName;
    locationSlug = citySlug;
  }

  let serviceSlug = facets?.serviceSlug ?? "standard-cleaning";
  const serviceName = serviceLabelFromSlug(serviceSlug);

  const pk = (params.primaryKeyword ?? "").trim();
  if (!facets && pk) {
    locationName = titleCaseWords(pk.split(/\s+/).slice(0, 2).join(" ")) || locationName;
  }

  return {
    location: locationName,
    city: cityName,
    service: serviceName,
    locationSlug,
    citySlug,
    serviceSlug,
    postSlug,
    relatedBlogPosts: params.relatedBlogPosts,
  };
}
