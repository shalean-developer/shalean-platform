import type { Metadata } from "next";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

const FALLBACK_TITLE = "Cleaning guides & tips | Shalean";
const FALLBACK_DESCRIPTION =
  "Shalean Cleaning Services — trusted home cleaning in Cape Town. Book vetted cleaners with instant pricing.";

/**
 * Self-referencing blog article canonical for `/blog/{slug}`.
 * Always HTTPS apex (`SITE_ORIGIN`); never inherits the homepage canonical.
 * Query strings are intentionally ignored — callers pass the route slug only.
 */
export function blogPostSelfCanonical(slug: string): string {
  const normalized = typeof slug === "string" ? slug.trim().replace(/^\/+|\/+$/g, "") : "";
  if (!normalized) return absoluteCanonicalUrl("/blog");
  // Guard against accidental absolute URLs or nested paths being passed as "slug".
  const leaf = normalized.includes("/") ? normalized.split("/").filter(Boolean).pop()! : normalized;
  return absoluteCanonicalUrl(`/blog/${leaf}`);
}

/**
 * Last-resort metadata when blog `generateMetadata` fails after the slug is known.
 * Must always emit a self-referencing canonical so production never inherits
 * `ROOT_METADATA` homepage canonical (or emits no canonical at all).
 */
export function buildStaticBlogMetadataFallback(slug: string): Metadata {
  const canonical = blogPostSelfCanonical(slug);
  return {
    title: FALLBACK_TITLE,
    description: FALLBACK_DESCRIPTION,
    robots: SEO_INDEX_FOLLOW,
    alternates: { canonical },
    openGraph: {
      title: FALLBACK_TITLE,
      description: FALLBACK_DESCRIPTION,
      url: canonical,
      type: "article",
    },
  };
}

/** True when a metadata object already has exactly one usable absolute canonical string. */
export function metadataHasCanonical(meta: Metadata): boolean {
  const c = meta.alternates?.canonical;
  return typeof c === "string" && c.trim().length > 0;
}

/**
 * Ensure blog article metadata always carries a self-referencing canonical for `slug`.
 * Does not overwrite a pre-existing canonical (avoids duplicates / conflicting rewrites
 * when a success branch already set the correct URL).
 */
export function ensureBlogPostSelfCanonical(meta: Metadata, slug: string): Metadata {
  if (metadataHasCanonical(meta)) return meta;
  const canonical = blogPostSelfCanonical(slug);
  return {
    ...meta,
    alternates: { ...meta.alternates, canonical },
    openGraph: {
      ...(typeof meta.openGraph === "object" && meta.openGraph ? meta.openGraph : {}),
      url: canonical,
    },
  };
}
