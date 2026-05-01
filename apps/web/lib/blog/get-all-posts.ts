import { getSupabaseServer } from "@/lib/supabase/server";
import { emptyBlogContentJson, type BlogContentJson } from "./content-json";
import { safeParseBlogContentJson } from "./content-json-schema";
import { excerptFromFirstIntroBlock } from "./excerpt-from-content-json";

const LIST_SELECT =
  "slug,title,h1,excerpt,featured_image_url,featured_image_alt,reading_time_minutes,published_at,content_json";

export type BlogIndexPostSource = "database" | "editorial" | "high_conversion" | "programmatic";

export type BlogIndexPost = {
  slug: string;
  title: string;
  excerpt: string;
  image: { src: string; alt: string };
  readingTime: number;
  publishedAt: string;
  source: BlogIndexPostSource;
};

const DEFAULT_LIST_HERO = "/images/marketing/cape-town-house-cleaning-kitchen.webp";

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

  const imgUrl =
    row.featured_image_url == null || row.featured_image_url === ""
      ? DEFAULT_LIST_HERO
      : String(row.featured_image_url);
  const imgAlt =
    row.featured_image_alt == null || row.featured_image_alt === ""
      ? `${displayTitle} — Shalean Cape Town`
      : String(row.featured_image_alt);

  const rt =
    typeof row.reading_time_minutes === "number" && row.reading_time_minutes >= 0
      ? row.reading_time_minutes
      : 5;

  const publishedAt = row.published_at == null ? "" : String(row.published_at);
  if (!publishedAt) return null;

  return {
    slug,
    title: displayTitle,
    excerpt,
    image: { src: imgUrl, alt: imgAlt },
    readingTime: rt,
    publishedAt,
    source: "database",
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

export { DEFAULT_LIST_HERO };
