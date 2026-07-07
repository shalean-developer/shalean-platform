import { getSupabaseServer } from "@/lib/supabase/server";
import { excerptFromFirstIntroBlock } from "@/lib/blog/excerpt-from-content-json";
import { emptyBlogContentJson, type BlogContentJson } from "@/lib/blog/content-json";
import { safeParseBlogContentJson } from "@/lib/blog/content-json-schema";

export type TaxonomyBlogCard = {
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string;
};

function normalizeContentJson(raw: unknown): BlogContentJson {
  const parsed = safeParseBlogContentJson(raw);
  if (!parsed.success) return emptyBlogContentJson();
  return parsed.data;
}

export async function getBlogPostsByCategorySlug(categorySlug: string): Promise<TaxonomyBlogCard[]> {
  const slug = categorySlug.trim();
  if (!slug) return [];

  const supabase = getSupabaseServer();
  if (!supabase) return [];

  const { data: cat, error: cErr } = await supabase
    .from("blog_categories")
    .select("id")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (cErr || !cat) return [];

  const categoryId = String((cat as { id: string }).id);
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("blog_posts")
    .select("slug,title,h1,excerpt,content_json,published_at")
    .eq("category_id", categoryId)
    .eq("status", "published")
    .lte("published_at", nowIso)
    .order("published_at", { ascending: false });

  if (error || !data) return [];

  return (data as Record<string, unknown>[]).map((row) => {
    const titleBase = String(row.title ?? "");
    const rawH1 = row.h1 == null || row.h1 === "" ? null : String(row.h1).trim();
    const display = rawH1 ?? titleBase;
    const content = normalizeContentJson(row.content_json);
    const rawExcerpt = row.excerpt == null || row.excerpt === "" ? null : String(row.excerpt).trim();
    const excerpt = rawExcerpt || excerptFromFirstIntroBlock(content, 160) || titleBase;
    return {
      slug: String(row.slug ?? ""),
      title: display,
      excerpt,
      publishedAt: String(row.published_at ?? ""),
    };
  });
}

export async function getBlogPostsByTagSlug(tagSlug: string): Promise<TaxonomyBlogCard[]> {
  const slug = tagSlug.trim();
  if (!slug) return [];

  const supabase = getSupabaseServer();
  if (!supabase) return [];

  const { data: tag, error: tErr } = await supabase.from("blog_tags").select("id").eq("slug", slug).maybeSingle();
  if (tErr || !tag) return [];

  const tagId = String((tag as { id: string }).id);
  const nowIso = new Date().toISOString();

  const { data: links, error: lErr } = await supabase.from("blog_post_tags").select("post_id").eq("tag_id", tagId);
  if (lErr || !links?.length) return [];

  const ids = [...new Set((links as { post_id: string }[]).map((l) => l.post_id))];

  const { data, error } = await supabase
    .from("blog_posts")
    .select("slug,title,h1,excerpt,content_json,published_at")
    .in("id", ids)
    .eq("status", "published")
    .lte("published_at", nowIso)
    .order("published_at", { ascending: false });

  if (error || !data) return [];

  return (data as Record<string, unknown>[]).map((row) => {
    const titleBase = String(row.title ?? "");
    const rawH1 = row.h1 == null || row.h1 === "" ? null : String(row.h1).trim();
    const display = rawH1 ?? titleBase;
    const content = normalizeContentJson(row.content_json);
    const rawExcerpt = row.excerpt == null || row.excerpt === "" ? null : String(row.excerpt).trim();
    const excerpt = rawExcerpt || excerptFromFirstIntroBlock(content, 160) || titleBase;
    return {
      slug: String(row.slug ?? ""),
      title: display,
      excerpt,
      publishedAt: String(row.published_at ?? ""),
    };
  });
}

export async function listActiveCategorySlugs(): Promise<string[]> {
  const supabase = getSupabaseServer();
  if (!supabase) return [];
  const { data, error } = await supabase.from("blog_categories").select("slug").eq("is_active", true);
  if (error || !data) return [];
  return (data as { slug: string }[]).map((r) => r.slug).filter(Boolean);
}

export async function listTagSlugs(): Promise<string[]> {
  const supabase = getSupabaseServer();
  if (!supabase) return [];
  const { data, error } = await supabase.from("blog_tags").select("slug");
  if (error || !data) return [];
  return (data as { slug: string }[]).map((r) => r.slug).filter(Boolean);
}
