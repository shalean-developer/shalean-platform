import { resolveBlogFeaturedAlt, resolveBlogFeaturedSrc } from "@/lib/blogImageMap";
import { assignStableBlogBlockIds } from "@/lib/blog/assign-stable-block-ids";
import { getRelatedPosts, type RelatedPostInput } from "@/lib/blog/seo/get-related-posts";
import { injectInternalLinks } from "@/lib/blog/seo/inject-internal-links";
import { buildInjectInternalLinksContext } from "@/lib/blog/seo/build-internal-link-context";
import { parseSeoInternalLinkContext } from "@/lib/blog/seo/seo-internal-link-context-schema";
import { getSupabaseServer } from "@/lib/supabase/server";
import { emptyBlogContentJson, type BlogContentJson } from "./content-json";
import { safeParseBlogContentJson } from "./content-json-schema";
import { excerptFromFirstIntroBlock } from "./excerpt-from-content-json";

const SELECT =
  "id,slug,title,h1,excerpt,status,source,content_json,meta_title,meta_description,canonical_url,featured_image_url,featured_image_alt,author_id,category_id,reading_time_minutes,published_at,updated_at,created_at,noindex,primary_keyword,secondary_keywords,search_intent,seo_internal_link_context,blog_categories(slug,name)";

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
  featuredImageUrl: string;
  featuredImageAlt: string;
  readingTimeMinutes: number | null;
  publishedAt: string;
  updatedAt: string;
  noindex: boolean;
  primaryKeyword: string | null;
  secondaryKeywords: string[];
  searchIntent: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  tagSlugs: string[];
  relatedPosts: { slug: string; title: string }[];
};

function normalizeContentJson(raw: unknown): BlogContentJson {
  const parsed = safeParseBlogContentJson(raw);
  if (!parsed.success) {
    console.error("[blog] Invalid content_json", parsed.error.flatten());
    return emptyBlogContentJson();
  }
  return parsed.data;
}

async function fetchTagSlugsForPost(
  supabase: NonNullable<Awaited<ReturnType<typeof getSupabaseServer>>>,
  postId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("blog_post_tags")
    .select("blog_tags(slug)")
    .eq("post_id", postId);
  if (error || !data) return [];
  const slugs: string[] = [];
  for (const row of data as { blog_tags?: { slug?: string } | { slug?: string }[] | null }[]) {
    const bt = row.blog_tags;
    const nested = Array.isArray(bt) ? bt[0] : bt;
    const s = nested?.slug;
    if (s) slugs.push(String(s));
  }
  return slugs;
}

async function fetchRelatedForInject(
  supabase: NonNullable<Awaited<ReturnType<typeof getSupabaseServer>>>,
  excludeSlug: string,
  current: RelatedPostInput,
): Promise<{ slug: string; title: string }[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("blog_posts")
    .select("slug,title,published_at,category_id")
    .eq("status", "published")
    .lte("published_at", nowIso)
    .neq("slug", excludeSlug)
    .order("published_at", { ascending: false })
    .limit(40);
  if (error || !data) return [];
  const inputs: RelatedPostInput[] = (data as Record<string, unknown>[]).map((r) => ({
    slug: String(r.slug ?? ""),
    title: String(r.title ?? ""),
    category_id: r.category_id == null ? null : String(r.category_id),
    published_at: r.published_at == null ? null : String(r.published_at),
  }));
  const ranked = getRelatedPosts(current, inputs, { limit: 4 });
  return ranked.map((p) => ({ slug: p.slug, title: p.title }));
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
  let content = normalizeContentJson(row.content_json);

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

  const primaryKeyword =
    row.primary_keyword == null || row.primary_keyword === "" ? null : String(row.primary_keyword).trim();
  const secondaryKeywords = Array.isArray(row.secondary_keywords)
    ? (row.secondary_keywords as unknown[]).map((x) => String(x)).filter(Boolean)
    : [];
  const searchIntent =
    row.search_intent == null || row.search_intent === "" ? null : String(row.search_intent).trim();

  const catRaw = row.blog_categories as { slug?: string; name?: string } | null | undefined;
  const categorySlug = catRaw?.slug ? String(catRaw.slug) : null;
  const categoryName = catRaw?.name ? String(catRaw.name) : null;

  const postId = String(row.id ?? "");
  const tagSlugs = postId ? await fetchTagSlugsForPost(supabase, postId) : [];

  const storedCtx = parseSeoInternalLinkContext(row.seo_internal_link_context);

  const related = await fetchRelatedForInject(supabase, trimmed, {
    slug: trimmed,
    title,
    category_id: row.category_id == null ? null : String(row.category_id),
    published_at: row.published_at == null ? null : String(row.published_at),
  });

  const ctx = buildInjectInternalLinksContext({
    slug: trimmed,
    stored: storedCtx,
    primaryKeyword,
    relatedBlogPosts: related,
  });

  content = injectInternalLinks(content, ctx);
  content = assignStableBlogBlockIds(content);

  return {
    id: postId,
    slug: String(row.slug),
    title,
    h1,
    excerpt,
    canonicalPath,
    metaTitle,
    metaDescription,
    content,
    featuredImageUrl: resolveBlogFeaturedSrc(
      trimmed,
      row.featured_image_url == null || row.featured_image_url === "" ? null : String(row.featured_image_url),
    ),
    featuredImageAlt: resolveBlogFeaturedAlt(
      trimmed,
      row.featured_image_alt == null || row.featured_image_alt === "" ? null : String(row.featured_image_alt),
    ),
    readingTimeMinutes:
      typeof row.reading_time_minutes === "number" ? row.reading_time_minutes : null,
    publishedAt: String(row.published_at),
    updatedAt: String(row.updated_at),
    noindex: Boolean(row.noindex),
    primaryKeyword,
    secondaryKeywords,
    searchIntent,
    categorySlug,
    categoryName,
    tagSlugs,
    relatedPosts: related,
  };
}

export function buildKeywordsPhrase(post: Pick<NormalizedDbBlogPost, "primaryKeyword" | "secondaryKeywords">): string | null {
  const parts = [post.primaryKeyword, ...post.secondaryKeywords].filter((x): x is string => Boolean(x && x.trim()));
  if (parts.length === 0) return null;
  return parts.join(", ");
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
