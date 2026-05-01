import type { BlogContentJson } from "@/lib/blog/content-json";
import { safeParseBlogContentJson } from "@/lib/blog/content-json-schema";
import { computeReadingTimeMinutes } from "@/lib/blog/compute-reading-time";
import { enhanceFaq } from "@/lib/blog/seo/enhance-faq";
import { parseProgrammaticSlugFeatures } from "@/lib/blog/seo/get-related-posts";
import { injectInternalLinks } from "@/lib/blog/seo/inject-internal-links";
import { optimizeMeta } from "@/lib/blog/seo/optimize-meta";
import { slugifyTitle } from "@/lib/blog/slugify-title";
import { getLocation } from "@/lib/locations";

export type DraftSeoRefreshRow = {
  slug: string;
  title: string | null;
  meta_title: string | null;
  meta_description: string | null;
  content_json: unknown;
};

export type DraftSeoRefreshPatch = {
  title: string;
  h1: string;
  meta_title: string;
  meta_description: string;
  content_json: BlogContentJson;
  reading_time_minutes: number;
};

function serviceDisplayName(serviceSlug: string): string {
  return serviceSlug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Re-applies internal link injection, FAQ enrichment, and meta optimization for a programmatic draft row.
 * Returns null when slug/content is not applicable or JSON is invalid.
 */
export function buildProgrammaticDraftSeoPatch(
  row: DraftSeoRefreshRow,
  relatedBlogPosts: { slug: string; title: string }[],
): DraftSeoRefreshPatch | null {
  const facets = parseProgrammaticSlugFeatures(row.slug);
  if (!facets?.locationSlug || !facets.serviceSlug || !facets.citySlug) return null;

  const loc = getLocation(facets.locationSlug);
  const locationName = loc?.name ?? slugifyTitle(facets.locationSlug).replace(/-/g, " ");
  const cityName = loc?.cityName ?? facets.citySlug.replace(/-/g, " ");
  const serviceName = serviceDisplayName(facets.serviceSlug);

  const parsed = safeParseBlogContentJson(row.content_json);
  if (!parsed.success) return null;

  let content_json = parsed.data;
  content_json = injectInternalLinks(content_json, {
    location: locationName,
    city: cityName,
    service: serviceName,
    locationSlug: facets.locationSlug,
    citySlug: facets.citySlug,
    serviceSlug: facets.serviceSlug,
    relatedBlogPosts,
  });
  content_json = enhanceFaq(content_json, {
    location: locationName,
    city: cityName,
    service: serviceName,
  });

  const metaOpt = optimizeMeta(
    {
      title: typeof row.title === "string" ? row.title : "",
      meta_title: typeof row.meta_title === "string" && row.meta_title.trim() ? row.meta_title : row.title ?? "",
      meta_description:
        typeof row.meta_description === "string" && row.meta_description.trim()
          ? row.meta_description
          : `Book ${serviceName.toLowerCase()} in ${locationName}, ${cityName} with Shalean.`,
    },
    { location: locationName, city: cityName, service: serviceName },
  );

  const reading_time_minutes = computeReadingTimeMinutes(content_json);

  return {
    title: metaOpt.title,
    h1: metaOpt.title,
    meta_title: metaOpt.meta_title,
    meta_description: metaOpt.meta_description,
    content_json,
    reading_time_minutes,
  };
}
