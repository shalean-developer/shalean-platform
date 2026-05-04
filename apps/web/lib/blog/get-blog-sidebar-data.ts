import { cache } from "react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getAllPublishedPosts, type BlogIndexPost } from "@/lib/blog/get-all-posts";

export type BlogSidebarCategory = { slug: string; name: string };

export const getBlogIndexPostsCached = cache(async (): Promise<BlogIndexPost[]> => {
  return getAllPublishedPosts();
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
