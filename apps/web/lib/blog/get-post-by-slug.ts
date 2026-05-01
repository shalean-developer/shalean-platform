import { getSupabaseServer } from "@/lib/supabase/server";
import { emptyBlogContentJson, type BlogContentJson } from "./content-json";
import { safeParseBlogContentJson } from "./content-json-schema";
import { excerptFromFirstIntroBlock } from "./excerpt-from-content-json";

const SELECT =
  "id,slug,title,h1,excerpt,status,source,content_json,meta_title,meta_description,canonical_url,featured_image_url,featured_image_alt,author_id,category_id,reading_time_minutes,published_at,updated_at,created_at,noindex";

export type NormalizedDbBlogPost = {
  id: string;
  slug: string;
  title: string;
  h1: string;
  excerpt: string;
  canonicalPath: string;
  metaTitle: string | null;
  metaDescription: string | null;
  content: BlogContentJson;
  featuredImageUrl: string | null;
  featuredImageAlt: string | null;
  readingTimeMinutes: number | null;
  publishedAt: string;
  updatedAt: string;
  noindex: boolean;
};

function normalizeContentJson(raw: unknown): BlogContentJson {
  const parsed = safeParseBlogContentJson(raw);
  if (!parsed.success) {
    console.error("[blog] Invalid content_json", parsed.error.flatten());
    return emptyBlogContentJson();
  }
  return parsed.data;
}

export async function getPostBySlug(slug: string): Promise<NormalizedDbBlogPost | null> {
  const trimmed = slug.trim();
  if (!trimmed) return null;

  const supabase = getSupabaseServer();
  if (!supabase) return null;

  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("blog_posts")
    .select(SELECT)
    .eq("slug", trimmed)
    .eq("status", "published")
    .lte("published_at", nowIso)
    .maybeSingle();

  if (error) {
    console.error("[blog] getPostBySlug", error.message);
    return null;
  }
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const content = normalizeContentJson(row.content_json);

  const title = String(row.title ?? "");
  const rawH1 = row.h1 == null || row.h1 === "" ? null : String(row.h1);
  const h1 = rawH1 ?? title;

  const rawExcerpt = row.excerpt == null || row.excerpt === "" ? null : String(row.excerpt).trim();
  const excerptFromBlocks = excerptFromFirstIntroBlock(content, 160);
  const excerpt = rawExcerpt || excerptFromBlocks;

  const rawCanonical = row.canonical_url == null || row.canonical_url === "" ? null : String(row.canonical_url).trim();
  /** Path or absolute URL as stored; metadata/JSON-LD must call `absoluteUrlFromCanonicalPath`. */
  const canonicalPath =
    rawCanonical && rawCanonical.startsWith("http")
      ? rawCanonical
      : rawCanonical
        ? rawCanonical
        : `/blog/${trimmed}`;

  const metaTitle = row.meta_title == null || row.meta_title === "" ? null : String(row.meta_title);
  const metaDescription =
    row.meta_description == null || row.meta_description === ""
      ? null
      : String(row.meta_description);

  return {
    id: String(row.id),
    slug: String(row.slug),
    title,
    h1,
    excerpt,
    canonicalPath,
    metaTitle,
    metaDescription,
    content,
    featuredImageUrl:
      row.featured_image_url == null || row.featured_image_url === ""
        ? null
        : String(row.featured_image_url),
    featuredImageAlt:
      row.featured_image_alt == null || row.featured_image_alt === ""
        ? null
        : String(row.featured_image_alt),
    readingTimeMinutes:
      typeof row.reading_time_minutes === "number" ? row.reading_time_minutes : null,
    publishedAt: String(row.published_at),
    updatedAt: String(row.updated_at),
    noindex: Boolean(row.noindex),
  };
}

export async function getPublishedBlogSlugs(): Promise<string[]> {
  const supabase = getSupabaseServer();
  if (!supabase) return [];

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("blog_posts")
    .select("slug")
    .eq("status", "published")
    .lte("published_at", nowIso);

  if (error) {
    console.error("[blog] getPublishedBlogSlugs", error.message);
    return [];
  }
  return (data ?? []).map((r) => String((r as { slug: string }).slug)).filter(Boolean);
}
