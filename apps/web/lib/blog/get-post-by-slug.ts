import { coerceBlogImageSrcForNext, resolveBlogFeaturedAlt, resolveBlogFeaturedSrc } from "@/lib/blogImageMap";
import { isBlogDraftPreviewAllowed } from "@/lib/blog/blog-draft-preview";
import { assignStableBlogBlockIds } from "@/lib/blog/assign-stable-block-ids";
import { getRelatedPosts, type RelatedPostInput } from "@/lib/blog/seo/get-related-posts";
import { injectInternalLinks } from "@/lib/blog/seo/inject-internal-links";
import { buildInjectInternalLinksContext } from "@/lib/blog/seo/build-internal-link-context";
import { parseSeoInternalLinkContext } from "@/lib/blog/seo/seo-internal-link-context-schema";
import { normalizeSemanticClusterInput } from "@/lib/seo/blogGovernance";
import { normalizeManualRelatedGuideSlugs } from "@/lib/blog/fetch-cluster-related-guides";
import { getSupabaseServer } from "@/lib/supabase/server";
import { emptyBlogContentJson, type BlogContentJson } from "./content-json";
import { safeParseBlogContentJson } from "./content-json-schema";
import { excerptFromFirstIntroBlock } from "./excerpt-from-content-json";

const SELECT =
  "id,slug,title,h1,excerpt,status,source,content_json,meta_title,meta_description,canonical_url,featured_image_url,featured_image_alt,author_id,category_id,reading_time_minutes,published_at,updated_at,created_at,noindex,primary_keyword,secondary_keywords,search_intent,seo_internal_link_context,semantic_cluster,related_guide_override_slugs,blog_categories(slug,name)";

/** Avoid Invalid Date strings leaking to layout/metadata (Intl.format throws). */
function clampToValidIso(value: string | null | undefined, fallbackIso: string): string {
  if (value == null) return fallbackIso;
  const s = String(value).trim();
  if (!s) return fallbackIso;
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) return fallbackIso;
  return new Date(ms).toISOString();
}

export type BlogPostDbStatus = "draft" | "published" | "scheduled";

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
  /** ISO date for display / JSON-LD — drafts use `created_at` when `published_at` is null. */
  publishedAt: string;
  updatedAt: string;
  /** Raw row status from `blog_posts.status`. */
  dbStatus: BlogPostDbStatus;
  /** True only when the post is published, live (`published_at` ≤ now), and not `noindex`. */
  indexedForSearch: boolean;
  noindex: boolean;
  primaryKeyword: string | null;
  secondaryKeywords: string[];
  searchIntent: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  tagSlugs: string[];
  /** Governed cluster key from `blog_posts.semantic_cluster` (null when unset / invalid). */
  semanticCluster: string | null;
  /** Editorial pins for cluster footer related guides (valid slugs only). */
  relatedGuideOverrideSlugs: string[];
  relatedPosts: { slug: string; title: string }[];
};

export type GetPostBySlugOptions = {
  previewToken?: string | null;
};

function normalizeContentJson(raw: unknown): BlogContentJson {
  try {
    const parsed = safeParseBlogContentJson(raw);
    if (!parsed.success) {
      console.error("[blog] Invalid content_json", parsed.error.flatten());
      return emptyBlogContentJson();
    }
    const blocks = Array.isArray(parsed.data.blocks) ? parsed.data.blocks : [];
    return { ...parsed.data, blocks };
  } catch (err) {
    console.error("[blog] normalizeContentJson fatal — falling back to empty blocks", err);
    return emptyBlogContentJson();
  }
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

export async function getPostBySlug(
  slug: string,
  opts?: GetPostBySlugOptions,
): Promise<NormalizedDbBlogPost | null> {
  const trimmed = slug.trim();
  if (!trimmed) return null;

  try {
    return await loadPostBySlug(trimmed, opts);
  } catch (err) {
    console.error("❌ getPostBySlug FAILED — returning null (maps to 404; check logs for root cause)", {
      slug: trimmed,
      error: err,
    });
    return null;
  }
}

async function loadPostBySlug(
  trimmed: string,
  opts?: GetPostBySlugOptions,
): Promise<NormalizedDbBlogPost | null> {
  const trace =
    process.env.NODE_ENV === "development" || process.env.BLOG_DEBUG_FETCH === "1";
  if (trace) {
    console.log("🔍 FETCHING SLUG:", trimmed);
  }

  const supabase = getSupabaseServer();
  if (!supabase) {
    console.error("❌ getPostBySlug: Supabase server client is NULL — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
    return null;
  }

  const nowIso = new Date().toISOString();
  const allowPreview = isBlogDraftPreviewAllowed(opts?.previewToken ?? null);

  if (process.env.NODE_ENV === "development") {
    console.log("[blog] getPostBySlug query", {
      slug: trimmed,
      previewToken: opts?.previewToken ?? null,
      allowPreview,
      filter: allowPreview ? "status IN draft|published|scheduled" : "status=published AND published_at<=now",
    });
  }

  let query = supabase.from("blog_posts").select(SELECT).eq("slug", trimmed);
  if (!allowPreview) {
    query = query.eq("status", "published").lte("published_at", nowIso);
  } else {
    query = query.in("status", ["draft", "published", "scheduled"]);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("[blog] getPostBySlug", error.message);
    return null;
  }
  if (!data) {
    if (trace) {
      console.log("[blog] getPostBySlug: no row for slug after query", trimmed);
    }
    return null;
  }
  if (trace) {
    console.log("[blog] getPostBySlug hit row id=", (data as { id?: string }).id, "status=", (data as { status?: string }).status);
  }

  const row = data as Record<string, unknown>;
  if (row.content_json == null) {
    console.error("❌ getPostBySlug: row has null content_json", { slug: trimmed, id: row.id });
  }
  const rawStatus = String(row.status ?? "draft");
  const dbStatus: BlogPostDbStatus =
    rawStatus === "published" || rawStatus === "scheduled" || rawStatus === "draft"
      ? rawStatus
      : "draft";
  const publishedAtRaw = row.published_at == null || row.published_at === "" ? null : String(row.published_at);
  const createdAtRaw = row.created_at == null || row.created_at === "" ? null : String(row.created_at);

  if (!allowPreview) {
    if (dbStatus !== "published" || !publishedAtRaw || new Date(publishedAtRaw) > new Date()) {
      return null;
    }
  } else if (dbStatus === "published" && !publishedAtRaw) {
    return null;
  }
  let content = normalizeContentJson(row.content_json);
  if (!Array.isArray(content.blocks)) {
    console.error("❌ getPostBySlug: normalized content missing blocks array", { slug: trimmed, id: row.id });
    content = { ...content, blocks: [] };
  }

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

  const semanticCluster = normalizeSemanticClusterInput(
    row.semantic_cluster == null || row.semantic_cluster === "" ? null : String(row.semantic_cluster),
  );
  const relatedGuideOverrideSlugs =
    normalizeManualRelatedGuideSlugs(
      Array.isArray(row.related_guide_override_slugs)
        ? (row.related_guide_override_slugs as unknown[]).map((x) => String(x))
        : null,
      8,
    ) ?? [];

  const storedCtx = parseSeoInternalLinkContext(row.seo_internal_link_context);

  const nowFallback = new Date().toISOString();
  const displayPublishedAt = clampToValidIso(
    publishedAtRaw ?? createdAtRaw ?? (row.updated_at != null && row.updated_at !== "" ? String(row.updated_at) : null),
    nowFallback,
  );
  const updatedAtNormalized = clampToValidIso(
    row.updated_at != null && row.updated_at !== "" ? String(row.updated_at) : null,
    displayPublishedAt,
  );
  const indexedForSearch =
    dbStatus === "published" &&
    Boolean(publishedAtRaw) &&
    new Date(publishedAtRaw!) <= new Date() &&
    !Boolean(row.noindex);

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

  try {
    content = injectInternalLinks(content, ctx);
  } catch (err) {
    console.error("[blog] injectInternalLinks failed — serving post without injected blocks", {
      slug: trimmed,
      id: row.id,
      err,
    });
  }
  try {
    content = assignStableBlogBlockIds(content);
  } catch (err) {
    console.error("[blog] assignStableBlogBlockIds failed — keeping blocks as-is", {
      slug: trimmed,
      id: row.id,
      err,
    });
    if (!Array.isArray(content.blocks)) {
      content = { ...content, blocks: [] };
    }
  }

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
    featuredImageUrl: coerceBlogImageSrcForNext(
      trimmed,
      resolveBlogFeaturedSrc(
        trimmed,
        row.featured_image_url == null || row.featured_image_url === "" ? null : String(row.featured_image_url),
      ),
    ),
    featuredImageAlt: resolveBlogFeaturedAlt(
      trimmed,
      row.featured_image_alt == null || row.featured_image_alt === "" ? null : String(row.featured_image_alt),
    ),
    readingTimeMinutes:
      typeof row.reading_time_minutes === "number" ? row.reading_time_minutes : null,
    publishedAt: displayPublishedAt,
    updatedAt: updatedAtNormalized,
    dbStatus,
    indexedForSearch,
    noindex: Boolean(row.noindex),
    primaryKeyword,
    secondaryKeywords,
    searchIntent,
    categorySlug,
    categoryName,
    tagSlugs,
    semanticCluster,
    relatedGuideOverrideSlugs,
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
    .lte("published_at", nowIso)
    .not("content_json", "is", null);

  if (error) {
    console.error("[blog] getPublishedBlogSlugs", error.message);
    return [];
  }
  return (data ?? []).map((r) => String((r as { slug: string }).slug)).filter(Boolean);
}

export type PublishedBlogSitemapRow = { slug: string; lastModified: Date };

/** Slug → `updated_at` (fallback `published_at`) for sitemap freshness signals. */
export async function getPublishedBlogSitemapRows(): Promise<PublishedBlogSitemapRow[]> {
  const supabase = getSupabaseServer();
  if (!supabase) return [];

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("blog_posts")
    .select("slug, published_at, updated_at, noindex")
    .eq("status", "published")
    .eq("noindex", false)
    .lte("published_at", nowIso)
    .not("content_json", "is", null);

  if (error) {
    console.error("[blog] getPublishedBlogSitemapRows", error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => {
      const slug = String((row as { slug: string }).slug).trim();
      if (!slug) return null;
      const updated = (row as { updated_at?: string | null }).updated_at;
      const published = (row as { published_at?: string | null }).published_at;
      const iso = updated?.trim() || published?.trim();
      if (!iso) return null;
      const ms = Date.parse(iso);
      if (Number.isNaN(ms)) return null;
      return { slug, lastModified: new Date(ms) };
    })
    .filter((r): r is PublishedBlogSitemapRow => r != null);
}

/**
 * Published CMS slugs marked `noindex` — used to suppress file-based sitemap fill
 * so a CMS noindex page is never re-listed via a code-owned twin.
 */
export async function getPublishedBlogNoindexSitemapSlugs(): Promise<string[]> {
  const supabase = getSupabaseServer();
  if (!supabase) return [];

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("blog_posts")
    .select("slug")
    .eq("status", "published")
    .eq("noindex", true)
    .lte("published_at", nowIso)
    .not("content_json", "is", null);

  if (error) {
    console.error("[blog] getPublishedBlogNoindexSitemapSlugs", error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => String((row as { slug: string }).slug).trim().toLowerCase())
    .filter(Boolean);
}
