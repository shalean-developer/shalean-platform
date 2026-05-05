import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminRequest } from "@/lib/api/admin-auth-request";
import { computeReadingTimeMinutes } from "@/lib/blog/compute-reading-time";
import { blogContentJsonSchema } from "@/lib/blog/content-json-schema";
import type { BlogContentJson } from "@/lib/blog/content-json";
import { normalizeSearchIntent, suggestAutoSeo } from "@/lib/blog/seo/auto-seo";
import { injectInternalLinks } from "@/lib/blog/seo/inject-internal-links";
import { buildInjectInternalLinksContext } from "@/lib/blog/seo/build-internal-link-context";
import { parseSeoInternalLinkContext } from "@/lib/blog/seo/seo-internal-link-context-schema";
import { validateBlogPublish } from "@/lib/blog/seo/publish-validation";
import { slugifyTitle } from "@/lib/blog/slugify-title";
import { getRelatedPosts, type RelatedPostInput } from "@/lib/blog/seo/get-related-posts";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statusEnum = z.enum(["draft", "published", "scheduled"]);
const sourceEnum = z.enum(["editorial", "programmatic", "high_conversion"]);

const basePostSchema = z.object({
  title: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug: lowercase letters, numbers, hyphens only"),
  h1: z.string().nullable().optional(),
  excerpt: z.string().nullable().optional(),
  status: statusEnum,
  source: sourceEnum.default("editorial"),
  published_at: z.string().nullable().optional(),
  meta_title: z.string().nullable().optional(),
  meta_description: z.string().nullable().optional(),
  canonical_url: z.string().nullable().optional(),
  featured_image_url: z.string().nullable().optional(),
  featured_image_alt: z.string().nullable().optional(),
  noindex: z.boolean().optional(),
  content_json: z.unknown(),
  primary_keyword: z.string().nullable().optional(),
  secondary_keywords: z.array(z.string()).nullable().optional(),
  search_intent: z.string().nullable().optional(),
  seo_internal_link_context: z.unknown().nullable().optional(),
  category_id: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z.string().uuid().nullable().optional(),
  ),
  tag_ids: z.array(z.string().uuid()).optional(),
  seo_generate_slug_from_keyword: z.boolean().optional(),
  seo_apply_suggestions: z.boolean().optional(),
});

const createSchema = basePostSchema;
const updateSchema = basePostSchema.extend({ id: z.string().uuid() });

function normalizeEmpty(s?: string | null): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t === "" ? null : t;
}

async function syncPostTags(admin: ReturnType<typeof getSupabaseAdmin>, postId: string, tagIds: string[] | undefined) {
  if (!admin || tagIds === undefined) return;
  await admin.from("blog_post_tags").delete().eq("post_id", postId);
  if (tagIds.length === 0) return;
  const rows = tagIds.map((tag_id) => ({ post_id: postId, tag_id }));
  const { error } = await admin.from("blog_post_tags").insert(rows);
  if (error) throw new Error(error.message);
}

function revalidateBlog(slug: string) {
  try {
    revalidatePath("/blog");
    revalidatePath(`/blog/${slug}`);
    revalidatePath("/blog/category");
    revalidatePath("/blog/tag");
  } catch {
    /* ignore outside Next runtime */
  }
}

async function injectLinksForSave(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  slug: string,
  title: string,
  content: BlogContentJson,
  row: {
    primary_keyword: string | null;
    seo_internal_link_context: Record<string, unknown> | null;
    category_id: string | null;
  },
): Promise<BlogContentJson> {
  const nowIso = new Date().toISOString();
  const { data } = await admin
    .from("blog_posts")
    .select("slug,title,published_at,category_id")
    .eq("status", "published")
    .lte("published_at", nowIso)
    .neq("slug", slug)
    .order("published_at", { ascending: false })
    .limit(40);
  const inputs: RelatedPostInput[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    slug: String(r.slug ?? ""),
    title: String(r.title ?? ""),
    category_id: r.category_id == null ? null : String(r.category_id),
    published_at: r.published_at == null ? null : String(r.published_at),
  }));
  const current: RelatedPostInput = {
    slug,
    title: title || slug,
    category_id: row.category_id,
    published_at: null,
  };
  const related = getRelatedPosts(current, inputs, { limit: 4 }).map((p) => ({ slug: p.slug, title: p.title }));

  const stored = parseSeoInternalLinkContext(row.seo_internal_link_context);
  const ctx = buildInjectInternalLinksContext({
    slug,
    stored,
    primaryKeyword: row.primary_keyword,
    relatedBlogPosts: related,
  });
  return injectInternalLinks(content, ctx);
}

function buildRow(
  input: z.infer<typeof basePostSchema>,
  content: BlogContentJson,
  opts?: { slugOverride?: string },
): Record<string, unknown> {
  const reading_time_minutes = computeReadingTimeMinutes(content);
  let published_at: string | null = normalizeEmpty(input.published_at);

  if (input.status === "draft") {
    published_at = null;
  } else if (input.status === "published") {
    if (!published_at) published_at = new Date().toISOString();
  } else if (input.status === "scheduled") {
    if (!published_at) {
      throw new Error("scheduled_requires_published_at");
    }
  }

  let slug = (opts?.slugOverride ?? input.slug).trim();

  const pk = normalizeEmpty(input.primary_keyword);
  const sec = input.secondary_keywords?.filter((s) => s.trim()) ?? [];
  const intent = normalizeSearchIntent(input.search_intent ?? undefined);

  let h1 = normalizeEmpty(input.h1);
  let meta_title = normalizeEmpty(input.meta_title);
  let meta_description = normalizeEmpty(input.meta_description);
  let titleRow = input.title.trim();

  if (input.seo_apply_suggestions) {
    const sug = suggestAutoSeo({
      title: titleRow,
      primary_keyword: pk,
      secondary_keywords: sec,
      search_intent: intent ?? input.search_intent,
    });
    if (!h1) h1 = sug.h1;
    if (!meta_title) meta_title = sug.meta_title;
    if (!meta_description) meta_description = sug.meta_description;
    titleRow = sug.title_for_row;
  }

  if (input.seo_generate_slug_from_keyword && pk) {
    slug = slugifyTitle(pk);
  }

  const ctxRaw = input.seo_internal_link_context;
  const seo_internal_link_context =
    ctxRaw == null ? null : parseSeoInternalLinkContext(ctxRaw) ?? null;

  return {
    slug,
    title: titleRow,
    h1,
    excerpt: normalizeEmpty(input.excerpt),
    status: input.status,
    source: input.source,
    published_at,
    meta_title,
    meta_description,
    canonical_url: normalizeEmpty(input.canonical_url),
    featured_image_url: normalizeEmpty(input.featured_image_url),
    featured_image_alt: normalizeEmpty(input.featured_image_alt),
    noindex: Boolean(input.noindex),
    content_json: content,
    reading_time_minutes,
    primary_keyword: pk,
    secondary_keywords: sec.length ? sec : null,
    search_intent: intent,
    seo_internal_link_context: seo_internal_link_context as Record<string, unknown> | null,
    category_id: input.category_id ?? null,
  };
}

export async function GET(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("status") ?? "all";

  let q = admin
    .from("blog_posts")
    .select("id,slug,title,status,source,updated_at,published_at")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (filter === "draft") q = q.eq("status", "draft");
  else if (filter === "published") q = q.eq("status", "published");

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ posts: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed.", details: parsed.error.flatten() }, { status: 400 });
  }

  const contentRes = blogContentJsonSchema.safeParse(parsed.data.content_json);
  if (!contentRes.success) {
    return NextResponse.json(
      { error: "Invalid content_json.", details: contentRes.error.flatten() },
      { status: 400 },
    );
  }

  let content = contentRes.data;

  let row: Record<string, unknown>;
  try {
    row = buildRow(parsed.data, content);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "scheduled_requires_published_at") {
      return NextResponse.json({ error: "Scheduled posts require a publish date." }, { status: 400 });
    }
    throw e;
  }

  let injected: BlogContentJson = content;
  const slugForInject = String(row.slug ?? "");
  try {
    injected = await injectLinksForSave(
      admin,
      slugForInject,
      String(row.title ?? ""),
      content,
      {
        primary_keyword: row.primary_keyword == null ? null : String(row.primary_keyword),
        seo_internal_link_context: (row.seo_internal_link_context as Record<string, unknown> | null) ?? null,
        category_id: row.category_id == null ? null : String(row.category_id),
      },
    );
    row.content_json = injected;
    row.reading_time_minutes = computeReadingTimeMinutes(injected);
  } catch {
    row.content_json = content;
    row.reading_time_minutes = computeReadingTimeMinutes(content);
  }

  if (parsed.data.status === "published") {
    const pub = validateBlogPublish(injected);
    if (!pub.ok) {
      console.warn("[admin/blog POST] Publish validation failed", {
        slug: slugForInject,
        issues: pub.issues,
      });
      return NextResponse.json(
        { error: "Publish validation failed.", validation: pub },
        { status: 400 },
      );
    }
  }

  const { data, error } = await admin.from("blog_posts").insert(row).select("id,slug").single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Slug already exists." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (data?.id && parsed.data.tag_ids) {
    try {
      await syncPostTags(admin, String(data.id), parsed.data.tag_ids);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Tag sync failed." }, { status: 500 });
    }
  }

  if (parsed.data.status === "published" && data?.slug) {
    revalidateBlog(String(data.slug));
  }

  return NextResponse.json({ post: data }, { status: 201 });
}

export async function PUT(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed.", details: parsed.error.flatten() }, { status: 400 });
  }

  const contentRes = blogContentJsonSchema.safeParse(parsed.data.content_json);
  if (!contentRes.success) {
    return NextResponse.json(
      { error: "Invalid content_json.", details: contentRes.error.flatten() },
      { status: 400 },
    );
  }

  let content = contentRes.data;

  const { id, ...fields } = parsed.data;
  let row: Record<string, unknown>;
  try {
    row = buildRow(fields, content);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "scheduled_requires_published_at") {
      return NextResponse.json({ error: "Scheduled posts require a publish date." }, { status: 400 });
    }
    throw e;
  }

  let injected: BlogContentJson = content;
  const slugForInject = String(row.slug ?? "");
  try {
    injected = await injectLinksForSave(
      admin,
      slugForInject,
      String(row.title ?? ""),
      content,
      {
        primary_keyword: row.primary_keyword == null ? null : String(row.primary_keyword),
        seo_internal_link_context: (row.seo_internal_link_context as Record<string, unknown> | null) ?? null,
        category_id: row.category_id == null ? null : String(row.category_id),
      },
    );
    row.content_json = injected;
    row.reading_time_minutes = computeReadingTimeMinutes(injected);
  } catch {
    row.content_json = content;
    row.reading_time_minutes = computeReadingTimeMinutes(content);
  }

  if (parsed.data.status === "published") {
    const pub = validateBlogPublish(injected);
    if (!pub.ok) {
      console.warn("[admin/blog PUT] Publish validation failed", {
        slug: slugForInject,
        issues: pub.issues,
      });
      return NextResponse.json(
        { error: "Publish validation failed.", validation: pub },
        { status: 400 },
      );
    }
  }

  const { data, error } = await admin.from("blog_posts").update(row).eq("id", id).select("id,slug").maybeSingle();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Slug already exists." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (parsed.data.tag_ids) {
    try {
      await syncPostTags(admin, id, parsed.data.tag_ids);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Tag sync failed." }, { status: 500 });
    }
  }

  if (parsed.data.status === "published" && data.slug) {
    revalidateBlog(String(data.slug));
  }

  return NextResponse.json({ post: data });
}
