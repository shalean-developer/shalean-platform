import { PROGRAMMATIC_POSTS } from "@/lib/blog/programmaticPosts";
import { CAPE_TOWN_HUB_BLOG_SLUGS, type HubBlogCard } from "@/lib/blog/get-all-posts";
import { getSupabaseServer } from "@/lib/supabase/server";

const CARD_SELECT = "slug,title,h1,excerpt";

/**
 * Blog cards for a suburb hub: location-specific programmatic guides first, then Cape Town pricing/how-to staples.
 */
export async function getLocationHubBlogCards(locationName: string): Promise<HubBlogCard[]> {
  const supabase = getSupabaseServer();
  if (!supabase) return [];

  const localSlugs = PROGRAMMATIC_POSTS.filter((p) => p.location === locationName).map((p) => p.slug);
  const orderedUnique = [...new Set([...localSlugs, ...CAPE_TOWN_HUB_BLOG_SLUGS])];
  if (orderedUnique.length === 0) return [];

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("blog_posts")
    .select(CARD_SELECT)
    .eq("status", "published")
    .in("slug", orderedUnique)
    .lte("published_at", nowIso);

  if (error) {
    console.error("[blog] getLocationHubBlogCards", error.message);
    return [];
  }

  const order = new Map<string, number>(orderedUnique.map((s, i) => [s, i]));
  const cards: HubBlogCard[] = [];

  for (const raw of data ?? []) {
    const row = raw as Record<string, unknown>;
    const slug = String(row.slug ?? "").trim();
    if (!slug) continue;
    const titleBase = String(row.title ?? "");
    const rawH1 = row.h1 == null || row.h1 === "" ? null : String(row.h1).trim();
    const displayTitle = rawH1 ?? titleBase;
    const excerpt = String(row.excerpt ?? "").trim() || displayTitle;
    cards.push({ slug, title: displayTitle, excerpt });
  }

  cards.sort((a, b) => (order.get(a.slug) ?? 99) - (order.get(b.slug) ?? 99));
  return cards.slice(0, 8);
}
