import { cache } from "react";
import { AIRBNB_HOST_GUIDE_POSTS } from "@/lib/blog/airbnbHostGuidePosts";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getAllPublishedPosts, type BlogIndexPost } from "@/lib/blog/get-all-posts";
import { resolveBlogFeaturedAlt, resolveBlogFeaturedSrc } from "@/lib/blogImageMap";

export type BlogSidebarCategory = { slug: string; name: string };

function airbnbHostGuideToIndexPost(slug: string): BlogIndexPost | null {
  const p = AIRBNB_HOST_GUIDE_POSTS.find((x) => x.slug === slug);
  if (!p) return null;
  return {
    slug: p.slug,
    title: p.h1,
    excerpt: p.description,
    image: { src: resolveBlogFeaturedSrc(p.slug), alt: resolveBlogFeaturedAlt(p.slug) },
    readingTime: p.readingTimeMinutes,
    publishedAt: p.publishedAt,
    source: "programmatic",
  };
}

export const getBlogIndexPostsCached = cache(async (): Promise<BlogIndexPost[]> => {
  const db = await getAllPublishedPosts();
  const dbSlugs = new Set(db.map((row) => row.slug));
  const extras: BlogIndexPost[] = [];
  for (const post of AIRBNB_HOST_GUIDE_POSTS) {
    if (dbSlugs.has(post.slug)) continue;
    const row = airbnbHostGuideToIndexPost(post.slug);
    if (row) extras.push(row);
  }
  return [...db, ...extras].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
});

export async function getBlogSidebarCategories(): Promise<BlogSidebarCategory[]> {
  const supabase = getSupabaseServer();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("blog_categories")
    .select("slug,name,sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error || !data) return [];

  return (data as { slug?: string; name?: string }[])
    .map((r) => ({
      slug: String(r.slug ?? "").trim(),
      name: String(r.name ?? "").trim(),
    }))
    .filter((c) => c.slug && c.name);
}

/** Recent posts for sidebar “Trending” (recency-based; excludes current slug). */
export function pickTrendingSidebarPosts(all: BlogIndexPost[], excludeSlug: string, limit = 5): BlogIndexPost[] {
  return all.filter((p) => p.slug !== excludeSlug).slice(0, limit);
}

export type RelatedGridPost = {
  slug: string;
  title: string;
  excerpt: string;
  image: { src: string; alt: string };
};

export function enrichRelatedPostsForGrid(
  related: { slug: string; title: string }[],
  indexPosts: BlogIndexPost[],
): RelatedGridPost[] {
  const bySlug = new Map(indexPosts.map((p) => [p.slug, p]));
  return related.map((r) => {
    const full = bySlug.get(r.slug);
    return {
      slug: r.slug,
      title: full?.title ?? r.title,
      excerpt: full?.excerpt ?? "",
      image: full?.image ?? { src: "/images/marketing/cape-town-house-cleaning-kitchen.webp", alt: r.title },
    };
  });
}

export function indexPostsToRelatedGrid(posts: BlogIndexPost[]): RelatedGridPost[] {
  return posts.map((p) => ({
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    image: p.image,
  }));
}
