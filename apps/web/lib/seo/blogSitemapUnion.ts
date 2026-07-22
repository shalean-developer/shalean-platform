/**
 * Union of CMS + file-based indexable blog articles for the marketing sitemap.
 * Canonical slug dedupe; CMS lastmod wins when both sources publish the same slug.
 */

import { AIRBNB_HOST_GUIDE_POSTS } from "@/lib/blog/airbnbHostGuidePosts";
import { getAllPublishedPosts } from "@/lib/blog/get-all-posts";
import {
  getPublishedBlogNoindexSitemapSlugs,
  getPublishedBlogSitemapRows,
  type PublishedBlogSitemapRow,
} from "@/lib/blog/get-post-by-slug";
import { getAllHighConversionBlogPosts } from "@/lib/blog/highConversionPosts";
import { ROUTED_PROGRAMMATIC_POSTS } from "@/lib/blog/programmaticPosts";
import { isRedirectAliasBlogSlug, resolveBlogRedirectChain } from "@/lib/blog/validBlogRoutes";
import { resolveProgrammaticBlogLastModified } from "@/lib/seo/sitemapLastModified";

export type BlogSitemapSource = "cms" | "file";

export type BlogSitemapUnionRow = {
  slug: string;
  lastModified: Date;
  source: BlogSitemapSource;
};

export type UnionBlogSitemapOptions = {
  /** Canonical (or raw) slugs suppressed because CMS publishes them as noindex. */
  suppressCanonicalSlugs?: readonly string[];
};

export function isIndexableBlogSitemapSlug(slug: string): boolean {
  const s = slug.trim().toLowerCase();
  if (!s || isRedirectAliasBlogSlug(s)) return false;
  const resolved = resolveBlogRedirectChain(`/blog/${s}`);
  return resolved.startsWith("/blog/");
}

/** Resolve to the final `/blog/{slug}` segment, or null if not an indexable blog URL. */
export function canonicalizeIndexableBlogSitemapSlug(slug: string): string | null {
  if (!isIndexableBlogSitemapSlug(slug)) return null;
  const canon = resolveBlogRedirectChain(`/blog/${slug.trim().toLowerCase()}`).replace(/^\/blog\//, "");
  if (!canon || !isIndexableBlogSitemapSlug(canon)) return null;
  return canon;
}

function toSuppressCanonicalSlug(slug: string): string | null {
  const s = slug.trim().toLowerCase();
  if (!s) return null;
  const resolved = resolveBlogRedirectChain(`/blog/${s}`);
  if (!resolved.startsWith("/blog/")) return null;
  const canon = resolved.replace(/^\/blog\//, "");
  return canon || null;
}

export function collectFileBasedBlogSitemapRows(): PublishedBlogSitemapRow[] {
  const bySlug = new Map<string, Date>();

  function consider(slug: string, lastModified: Date | null): void {
    const canon = canonicalizeIndexableBlogSitemapSlug(slug);
    if (!canon || !lastModified) return;
    const prev = bySlug.get(canon);
    if (!prev || lastModified.getTime() > prev.getTime()) {
      bySlug.set(canon, lastModified);
    }
  }

  for (const post of getAllHighConversionBlogPosts()) {
    consider(post.slug, resolveProgrammaticBlogLastModified(post.slug));
  }
  for (const post of ROUTED_PROGRAMMATIC_POSTS) {
    consider(post.slug, resolveProgrammaticBlogLastModified(post.slug));
  }
  for (const post of AIRBNB_HOST_GUIDE_POSTS) {
    consider(post.slug, resolveProgrammaticBlogLastModified(post.slug));
  }

  return [...bySlug.entries()].map(([slug, lastModified]) => ({ slug, lastModified }));
}

/**
 * Pure union: CMS rows first (precedence), then file-based fill gaps.
 * Dedupes on canonical slug; never emits redirect aliases / non-blog terminals.
 * CMS noindex slugs suppress file-based twins so sitemap never lists a noindex CMS URL.
 */
export function unionBlogSitemapRows(
  cmsRows: readonly PublishedBlogSitemapRow[],
  fileRows: readonly PublishedBlogSitemapRow[],
  options?: UnionBlogSitemapOptions,
): BlogSitemapUnionRow[] {
  const suppress = new Set<string>();
  for (const slug of options?.suppressCanonicalSlugs ?? []) {
    const canon = toSuppressCanonicalSlug(slug);
    if (canon) suppress.add(canon);
  }

  const map = new Map<string, BlogSitemapUnionRow>();

  for (const row of cmsRows) {
    const canon = canonicalizeIndexableBlogSitemapSlug(row.slug);
    if (!canon || suppress.has(canon)) continue;
    map.set(canon, { slug: canon, lastModified: row.lastModified, source: "cms" });
  }

  for (const row of fileRows) {
    const canon = canonicalizeIndexableBlogSitemapSlug(row.slug);
    if (!canon || map.has(canon) || suppress.has(canon)) continue;
    map.set(canon, { slug: canon, lastModified: row.lastModified, source: "file" });
  }

  return [...map.values()];
}

/**
 * Canonical slugs of indexable articles linked from the `/blog` hub grid
 * (published CMS cards that are not noindex / not redirect aliases).
 */
export async function listCanonicalIndexableBlogHubArticleSlugs(): Promise<string[]> {
  const hubPosts = await getAllPublishedPosts();
  const out = new Set<string>();
  for (const post of hubPosts) {
    if (post.noindex) continue;
    const canon = canonicalizeIndexableBlogSitemapSlug(post.slug);
    if (canon) out.add(canon);
  }
  return [...out].sort();
}

/**
 * CMS ∪ file-based rows for sitemap generation (CMS lastmod wins on collision).
 * Also backfills any indexable hub-linked slugs missing from both pools.
 */
export async function collectUnionBlogSitemapRows(): Promise<BlogSitemapUnionRow[]> {
  let cms: PublishedBlogSitemapRow[] = [];
  let cmsNoindexSlugs: string[] = [];
  try {
    const [indexable, noindex] = await Promise.all([
      getPublishedBlogSitemapRows(),
      getPublishedBlogNoindexSitemapSlugs(),
    ]);
    cms = indexable;
    cmsNoindexSlugs = noindex;
  } catch (err) {
    console.error("[sitemap] CMS sitemap source fetch failed — file-based union only", err);
  }

  const map = new Map(
    unionBlogSitemapRows(cms, collectFileBasedBlogSitemapRows(), {
      suppressCanonicalSlugs: cmsNoindexSlugs,
    }).map((row) => [row.slug, row]),
  );

  try {
    const hubPosts = await getAllPublishedPosts();
    for (const post of hubPosts) {
      if (post.noindex) {
        const suppressed = toSuppressCanonicalSlug(post.slug);
        if (suppressed) map.delete(suppressed);
        continue;
      }
      const canon = canonicalizeIndexableBlogSitemapSlug(post.slug);
      if (!canon || map.has(canon)) continue;
      const ms = Date.parse(post.publishedAt);
      if (Number.isNaN(ms)) continue;
      map.set(canon, {
        slug: canon,
        lastModified: new Date(ms),
        source: "cms",
      });
    }
  } catch (err) {
    console.error("[sitemap] hub indexable backfill failed", err);
  }

  return [...map.values()];
}
