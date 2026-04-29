import { BLOG_POSTS, type BlogPostMeta, type BlogPostSlug } from "./posts";

const FALLBACK_ORDER: BlogPostSlug[] = [
  "deep-vs-standard-cleaning-cape-town",
  "airbnb-cleaning-checklist",
  "cleaning-cost-cape-town",
  "move-out-cleaning-guide",
];

/**
 * Returns up to `limit` related posts: `relatedSlugs` first (deduped), then newest others excluding `current`.
 */
export function resolveRelatedPosts(
  current: BlogPostSlug,
  relatedSlugs: readonly BlogPostSlug[],
  limit = 5,
): BlogPostMeta[] {
  const seen = new Set<BlogPostSlug>([current]);
  const out: BlogPostMeta[] = [];

  for (const s of relatedSlugs) {
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(BLOG_POSTS[s]);
    if (out.length >= limit) return out;
  }

  for (const s of FALLBACK_ORDER) {
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(BLOG_POSTS[s]);
    if (out.length >= limit) return out;
  }

  return out;
}
