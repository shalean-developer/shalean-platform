import { BLOG_POSTS, type BlogPostMeta, type BlogPostSlug } from "./posts";
import {
  CANONICAL_AIRBNB_CHECKLIST_CAPE_TOWN_HREF,
  CANONICAL_MOVE_OUT_CHECKLIST_BLOG_HREF,
} from "@/lib/blog/canonicalEditorialBlogLinks";
import { getCanonicalBlogRoute } from "@/lib/blog/validBlogRoutes";

const FALLBACK_ORDER: BlogPostSlug[] = [
  "deep-vs-standard-cleaning-cape-town",
  "airbnb-cleaning-checklist",
  "cleaning-cost-cape-town",
  "move-out-cleaning-guide",
];

/** Stable public path for legacy seed metadata keys (blog, pricing hub, or redirect-canonical blog). */
function legacyEditorialPublicHref(slug: BlogPostSlug): string {
  switch (slug) {
    case "airbnb-cleaning-checklist":
      return CANONICAL_AIRBNB_CHECKLIST_CAPE_TOWN_HREF;
    case "move-out-cleaning-guide":
      return CANONICAL_MOVE_OUT_CHECKLIST_BLOG_HREF;
    case "cleaning-cost-cape-town":
      return "/cleaning-prices-cape-town";
    case "deep-vs-standard-cleaning-cape-town":
      return getCanonicalBlogRoute(slug);
    default:
      return getCanonicalBlogRoute(slug);
  }
}

function dedupeKeyForSlug(slug: BlogPostSlug): string {
  return legacyEditorialPublicHref(slug).replace(/\/+$/, "") || "/";
}

export type ResolvedRelatedPostMeta = BlogPostMeta & { href: string };

function withResolvedHref(meta: BlogPostMeta): ResolvedRelatedPostMeta {
  return { ...meta, href: legacyEditorialPublicHref(meta.slug) };
}

/**
 * Returns up to `limit` related posts: `relatedSlugs` first (deduped), then newest others excluding `current`.
 * `href` is a direct 200 target (no legacy short `/blog/*` aliases).
 */
export function resolveRelatedPosts(
  current: BlogPostSlug,
  relatedSlugs: readonly BlogPostSlug[],
  limit = 5,
): ResolvedRelatedPostMeta[] {
  const seen = new Set<string>([dedupeKeyForSlug(current)]);
  const out: ResolvedRelatedPostMeta[] = [];

  for (const s of relatedSlugs) {
    const key = dedupeKeyForSlug(s);
    if (seen.has(key)) continue;
    const meta = BLOG_POSTS[s];
    if (!meta) continue;
    seen.add(key);
    out.push(withResolvedHref(meta));
    if (out.length >= limit) return out;
  }

  for (const s of FALLBACK_ORDER) {
    const key = dedupeKeyForSlug(s);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(withResolvedHref(BLOG_POSTS[s]));
    if (out.length >= limit) return out;
  }

  return out;
}
