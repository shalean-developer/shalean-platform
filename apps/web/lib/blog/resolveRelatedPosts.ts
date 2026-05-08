import { BLOG_POSTS, type BlogPostMeta, type BlogPostSlug } from "./posts";
import { getCanonicalBlogSlug } from "@/lib/blog/validBlogRoutes";

const FALLBACK_ORDER: BlogPostSlug[] = [
  "deep-vs-standard-cleaning-cape-town",
  "airbnb-cleaning-checklist",
  "cleaning-cost-cape-town",
  "move-out-cleaning-guide",
];

export type ResolvedRelatedPostMeta = BlogPostMeta & { hrefSlug: string };

function withHrefSlug(meta: BlogPostMeta): ResolvedRelatedPostMeta {
  return {
    ...meta,
    hrefSlug: getCanonicalBlogSlug(meta.slug),
  };
}

/**
 * Returns up to `limit` related posts: `relatedSlugs` first (deduped), then newest others excluding `current`.
 * `hrefSlug` is always redirect-canonical for `/blog/{slug}` navigation.
 */
export function resolveRelatedPosts(
  current: BlogPostSlug,
  relatedSlugs: readonly BlogPostSlug[],
  limit = 5,
): ResolvedRelatedPostMeta[] {
  const seenCanon = new Set<string>([getCanonicalBlogSlug(current)]);
  const out: ResolvedRelatedPostMeta[] = [];

  for (const s of relatedSlugs) {
    const canon = getCanonicalBlogSlug(s);
    if (seenCanon.has(canon)) continue;
    const meta = BLOG_POSTS[s];
    if (!meta) continue;
    seenCanon.add(canon);
    out.push(withHrefSlug(meta));
    if (out.length >= limit) return out;
  }

  for (const s of FALLBACK_ORDER) {
    const canon = getCanonicalBlogSlug(s);
    if (seenCanon.has(canon)) continue;
    seenCanon.add(canon);
    out.push(withHrefSlug(BLOG_POSTS[s]));
    if (out.length >= limit) return out;
  }

  return out;
}
