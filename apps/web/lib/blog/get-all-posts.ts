import {
  coerceBlogImageSrcForNext,
  DEFAULT_BLOG_FEATURED_IMAGE,
  resolveBlogFeaturedAlt,
  resolveBlogFeaturedSrc,
} from "@/lib/blogImageMap";
import { getSupabaseServer } from "@/lib/supabase/server";
import { emptyBlogContentJson, type BlogContentJson } from "./content-json";
import { safeParseBlogContentJson } from "./content-json-schema";
import { excerptFromFirstIntroBlock } from "./excerpt-from-content-json";

const LIST_SELECT =
  "slug,title,h1,excerpt,featured_image_url,featured_image_alt,reading_time_minutes,published_at,content_json,source,category:blog_categories(slug,name)";

/** Mirrors `blog_post_source` for rows returned from Supabase. */
export type BlogIndexPostSource = "editorial" | "programmatic" | "high_conversion";

export type BlogIndexPost = {
  slug: string;
  title: string;
  excerpt: string;
  image: { src: string; alt: string };
  readingTime: number;
  publishedAt: string;
  source: BlogIndexPostSource;
  /** Present when loaded from Supabase and category is set */
  categorySlug?: string | null;
  categoryName?: string | null;
};

function normalizeContentJson(raw: unknown): BlogContentJson {
  const parsed = safeParseBlogContentJson(raw);
  if (!parsed.success) return emptyBlogContentJson();
  return parsed.data;
}

function normalizeDbRow(row: Record<string, unknown>): BlogIndexPost | null {
  const slug = String(row.slug ?? "").trim();
  if (!slug) return null;

  const titleBase = String(row.title ?? "");
  const rawH1 = row.h1 == null || row.h1 === "" ? null : String(row.h1).trim();
  const displayTitle = rawH1 ?? titleBase;

  const content = normalizeContentJson(row.content_json);
  const rawExcerpt = row.excerpt == null || row.excerpt === "" ? null : String(row.excerpt).trim();
  const excerpt = rawExcerpt || excerptFromFirstIntroBlock(content, 160) || titleBase;

  const rawImg =
    row.featured_image_url == null || row.featured_image_url === "" ? null : String(row.featured_image_url);
  const rawAlt =
    row.featured_image_alt == null || row.featured_image_alt === "" ? null : String(row.featured_image_alt);
  const imgUrl = coerceBlogImageSrcForNext(slug, resolveBlogFeaturedSrc(slug, rawImg));
  const imgAlt = resolveBlogFeaturedAlt(slug, rawAlt);

  const rt =
    typeof row.reading_time_minutes === "number" && row.reading_time_minutes >= 0
      ? row.reading_time_minutes
      : 5;

  const publishedAt = row.published_at == null ? "" : String(row.published_at);
  if (!publishedAt) return null;

  let categorySlug: string | null = null;
  let categoryName: string | null = null;
  const catRaw = row.category;
  if (catRaw && typeof catRaw === "object" && !Array.isArray(catRaw)) {
    const c = catRaw as Record<string, unknown>;
    if (c.slug != null && String(c.slug).trim()) categorySlug = String(c.slug).trim();
    if (c.name != null && String(c.name).trim()) categoryName = String(c.name).trim();
  }

  const rawSource = row.source;
  const source: BlogIndexPostSource =
    rawSource === "programmatic"
      ? "programmatic"
      : rawSource === "high_conversion"
        ? "high_conversion"
        : "editorial";

  return {
    slug,
    title: displayTitle,
    excerpt,
    image: { src: imgUrl, alt: imgAlt },
    readingTime: rt,
    publishedAt,
    source,
    categorySlug,
    categoryName,
  };
}

export async function getAllPublishedPosts(): Promise<BlogIndexPost[]> {
  const supabase = getSupabaseServer();
  if (!supabase) return [];

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("blog_posts")
    .select(LIST_SELECT)
    .eq("status", "published")
    .in("source", ["editorial", "programmatic"])
    .lte("published_at", nowIso)
    .order("published_at", { ascending: false });

  if (error) {
    console.error("[blog] getAllPublishedPosts", error.message);
    return [];
  }

  const out: BlogIndexPost[] = [];
  for (const row of data ?? []) {
    const n = normalizeDbRow(row as Record<string, unknown>);
    if (n) out.push(n);
  }
  return out;
}

/** @deprecated Use DEFAULT_BLOG_FEATURED_IMAGE from `@/lib/blogImageMap` — kept for index “variety” checks. */
export const DEFAULT_LIST_HERO = DEFAULT_BLOG_FEATURED_IMAGE;

/** Cape Town hub “guides” strip — pricing + service guides linked from location hubs. */
export const CAPE_TOWN_HUB_BLOG_SLUGS = [
  "cleaning-cost-cape-town",
  "deep-vs-standard-cleaning-cape-town",
  "move-out-cleaning-guide",
  "airbnb-cleaning-checklist",
] as const;

export type HubBlogCard = { slug: string; title: string; excerpt: string };

/**
 * Published hub cards only (no draft / scheduled rows). Order matches `CAPE_TOWN_HUB_BLOG_SLUGS`.
 */
export async function getPublishedHubBlogCards(): Promise<HubBlogCard[]> {
  const supabase = getSupabaseServer();
  if (!supabase) return [];

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("blog_posts")
    .select("slug,title,h1,excerpt")
    .eq("status", "published")
    .in("slug", [...CAPE_TOWN_HUB_BLOG_SLUGS])
    .lte("published_at", nowIso);

  if (error) {
    console.error("[blog] getPublishedHubBlogCards", error.message);
    return [];
  }

  const order = new Map<string, number>(CAPE_TOWN_HUB_BLOG_SLUGS.map((s, i) => [s, i]));
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
  return cards;
}
