import { createBlogPreviewQuery } from "@/lib/blog/blog-draft-preview";
import { runPublishGovernanceValidation } from "@/lib/blog/validate-blog-release";
import { createHash } from "node:crypto";
import { revalidateBlog } from "@/lib/blog/revalidate-blog";
import { isRedirectAliasBlogSlug } from "@/lib/blog/validBlogRoutes";
import { isAllowedAuthoringBlogImageSrc } from "@/lib/blog/blog-image-validation";
import { findUnsupportedBlogImages } from "@/lib/blog/blog-image-validation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireBlogRead, requireBlogSave } from "@/lib/blog/admin-blog-auth";
import { computeReadingTimeMinutes } from "@/lib/blog/compute-reading-time";
import { blogContentJsonSchema } from "@/lib/blog/content-json-schema";
import type { BlogContentJson } from "@/lib/blog/content-json";
import { normalizeSearchIntent, suggestAutoSeo } from "@/lib/blog/seo/auto-seo";
import { injectInternalLinks } from "@/lib/blog/seo/inject-internal-links";
import { buildInjectInternalLinksContext } from "@/lib/blog/seo/build-internal-link-context";
import { parseSeoInternalLinkContext } from "@/lib/blog/seo/seo-internal-link-context-schema";
import type { ClusterPeerPost } from "@/lib/blog/seo/blog-cluster-collision";
import { fetchPublishedClusterPeersUnified } from "@/lib/blog/seo/fetch-cluster-peer-posts";
import { warnIfSerializedBlogBodyContainsLegacyManualClusterRelatedGuidesMarkdown } from "@/lib/blog/cluster-related-guides-legacy-markdown-guard";
import { normalizeManualRelatedGuideSlugs } from "@/lib/blog/fetch-cluster-related-guides";
import { validateBlogPublish } from "@/lib/blog/seo/publish-validation";
import { validateCmsBlogLinksForAdminSave } from "@/lib/blog/cms-blog-link-validation";
import {
  normalizeSemanticClusterInput,
  resolveSemanticClusterKey,
  semanticClusterKeyToCollisionTagSlug,
} from "@/lib/seo/blogGovernance";
import { slugifyTitle } from "@/lib/blog/slugify-title";
import { getRelatedPosts, type RelatedPostInput } from "@/lib/blog/seo/get-related-posts";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveBlogFeaturedAlt, resolveBlogFeaturedSrc } from "@/lib/blogImageMap";

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
  published_at: z.string().datetime({ offset: true }).nullable().optional(),
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
  /** Canonical governance cluster (`blog_posts.semantic_cluster`); invalid values stored as null. */
  semantic_cluster: z.string().nullable().optional(),
  /** Pin/order slugs in the public cluster related-guides footer (max 8; invalid slugs dropped on save). */
  related_guide_override_slugs: z.array(z.string()).max(8).optional(),
  seo_generate_slug_from_keyword: z.boolean().optional(),
  seo_apply_suggestions: z.boolean().optional(),
});

const createSchema = basePostSchema.extend({ request_id: z.string().uuid() });
const updateSchema = createSchema.extend({ id: z.string().uuid(), expected_updated_at: z.string().datetime({ offset: true }) });

function normalizeEmpty(s?: string | null): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t === "" ? null : t;
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
    if (!published_at || !Number.isFinite(Date.parse(published_at)) || Date.parse(published_at) <= Date.now()) {
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

  if (isRedirectAliasBlogSlug(slug)) throw new Error("redirect_only_slug");
  const canonical = normalizeEmpty(input.canonical_url);
  if (canonical && canonical !== `/blog/${slug}` && canonical !== `https://shalean.co.za/blog/${slug}`) throw new Error("self_canonical_required");
  const ctxRaw = input.seo_internal_link_context;
  const seo_internal_link_context =
    ctxRaw == null ? null : parseSeoInternalLinkContext(ctxRaw) ?? null;

  if (input.featured_image_url?.trim() && !isAllowedAuthoringBlogImageSrc(input.featured_image_url)) {
    throw new Error("unsupported_image");
  }
  if (findUnsupportedBlogImages(content).length) throw new Error("unsupported_image");
  const featured_image_url = resolveBlogFeaturedSrc(slug, normalizeEmpty(input.featured_image_url));
  const featured_image_alt = resolveBlogFeaturedAlt(slug, normalizeEmpty(input.featured_image_alt));

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
    canonical_url: null, // Self canonical is derived from the governed slug.
    featured_image_url,
    featured_image_alt,
    noindex: Boolean(input.noindex),
    content_json: content,
    reading_time_minutes,
    primary_keyword: pk,
    secondary_keywords: sec.length ? sec : null,
    search_intent: intent,
    ...(input.seo_internal_link_context !== undefined ? { seo_internal_link_context: seo_internal_link_context as Record<string, unknown> | null } : {}),
    category_id: input.category_id ?? null,
    semantic_cluster: normalizeSemanticClusterInput(input.semantic_cluster),
    related_guide_override_slugs: normalizeManualRelatedGuideSlugs(input.related_guide_override_slugs, 8),
  };
}

export async function GET(request: Request) {
  const auth = await requireBlogRead(request);
  if (!auth.ok) return auth.response;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("status") ?? "all";
  const page = Math.trunc(Math.max(1, Math.min(100000, Number(searchParams.get("page")) || 1)));
  const pageSize = Math.trunc(Math.max(1, Math.min(100, Number(searchParams.get("page_size")) || 15)));
  const search = (searchParams.get("search") ?? "").trim().slice(0,150);
  // PostgREST filter punctuation is not accepted as part of a search expression.
  const term = search.replace(/[%_(),.\\]/g, " ").trim();
  let q = admin.from("blog_posts").select("id,slug,title,status,source,updated_at,published_at", { count: "exact" })
    .order("updated_at", { ascending: false }).order("id").range((page - 1) * pageSize, page * pageSize - 1);
  if (["draft","published","scheduled"].includes(filter)) q = q.eq("status", filter);
  if (term) q = q.or(`title.ilike.%${term}%,slug.ilike.%${term}%`);
  const [posts, ...counts] = await Promise.all([q, ...["published","draft","scheduled"].map(status => admin.from("blog_posts").select("id", { count: "exact", head: true }).eq("status",status))]);
  if (posts.error || counts.some(c => c.error)) return NextResponse.json({ error: "Unable to load posts." }, { status: 503 });
  const totals = { published: counts[0].count ?? 0, draft: counts[1].count ?? 0, scheduled: counts[2].count ?? 0 };
  return NextResponse.json({ posts: (posts.data ?? []).map(post => ({ ...post, retired: isRedirectAliasBlogSlug(post.slug) })), total: posts.count ?? 0, counts: totals, page, page_size: pageSize });
}

export async function POST(request: Request) {
  const auth = await requireBlogRead(request);
  if (!auth.ok) return auth.response;
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

  const saveAuth = await requireBlogSave(request, parsed.data.status);
  if (!saveAuth.ok) return saveAuth.response;
  if (parsed.data.status === "scheduled") {
    const { data: ready, error: schedulerError } = await admin.rpc("blog_scheduler_is_enabled");
    if (schedulerError || ready !== true) return NextResponse.json({ error: "Scheduling is paused until the publication worker is verified and activated. Save a draft instead." }, { status: 503 });
  }

  const contentRes = blogContentJsonSchema.safeParse(parsed.data.content_json);
  if (!contentRes.success) {
    return NextResponse.json(
      { error: "Invalid content_json.", details: contentRes.error.flatten() },
      { status: 400 },
    );
  }

  const content = contentRes.data;
  warnIfSerializedBlogBodyContainsLegacyManualClusterRelatedGuidesMarkdown(content, {
    slug: parsed.data.slug,
    source: "admin_blog_posts_POST",
  });

  let row: Record<string, unknown>;
  try {
    row = buildRow(parsed.data, content);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "scheduled_requires_published_at") {
      return NextResponse.json({ error: "Scheduled posts require a valid future publish date (Africa/Johannesburg)." }, { status: 400 });
    }
    return NextResponse.json({ error: ({ unsupported_image: "Unsupported image URL. Upload the image or use an approved image host.", redirect_only_slug: "This slug is retired and redirects to its canonical page. Choose a new slug.", self_canonical_required: "Canonical must be this post’s own https://shalean.co.za/blog/{slug} URL." } as Record<string,string>)[msg] ?? "Invalid post settings." }, { status: 400 });
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

  if (parsed.data.status === "published" || parsed.data.status === "scheduled") {
    const cmsBroken = await validateCmsBlogLinksForAdminSave(admin, {
      slug: slugForInject,
      content: injected,
      canonical_url: row.canonical_url == null ? null : String(row.canonical_url),
      related_guide_override_slugs: Array.isArray(row.related_guide_override_slugs)
        ? (row.related_guide_override_slugs as string[])
        : null,
      status: parsed.data.status,
    });
    if (cmsBroken.length) {
      return NextResponse.json(
        {
          error: "CMS internal blog link validation failed.",
          code: "cms_link_validation",
          broken: cmsBroken,
        },
        { status: 400 },
      );
    }
  }

  let publishGovernanceResult: ReturnType<typeof validateBlogPublish> | null = null;
  if (parsed.data.status !== "draft") {
    publishGovernanceResult = await runPublishGovernanceValidation(admin, {
      content: injected,
      tag_ids: parsed.data.tag_ids,
      slug: slugForInject,
      title: String(row.title ?? ""),
      primary_keyword: row.primary_keyword == null ? null : String(row.primary_keyword),
      semantic_cluster: row.semantic_cluster == null ? null : String(row.semantic_cluster),
    });
    if (publishGovernanceResult.warnings.length) {
      console.warn("[admin/blog POST] Publish governance warnings", {
        slug: slugForInject,
        warnings: publishGovernanceResult.warnings,
      });
    }
    if (!publishGovernanceResult.ok) {
      console.warn("[admin/blog POST] Publish validation failed", {
        slug: slugForInject,
        issues: publishGovernanceResult.issues,
      });
      return NextResponse.json(
        { error: "Publish validation failed.", validation: publishGovernanceResult },
        { status: 400 },
      );
    }
  }

  return persistPost(admin, saveAuth.user.id, parsed.data, row, publishGovernanceResult);
}

export async function PUT(request: Request) {
  const auth = await requireBlogRead(request);
  if (!auth.ok) return auth.response;
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

  const { data: previous, error: previousError } = await admin.from("blog_posts").select("*").eq("id", parsed.data.id).maybeSingle();
  if (previousError) return NextResponse.json({ error: "Unable to load current post." }, { status: 503 });
  if (!previous) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const saveAuth = await requireBlogSave(request, parsed.data.status, String(previous.status));
  if (!saveAuth.ok) return saveAuth.response;
  if (parsed.data.status === "scheduled") {
    const { data: ready, error: schedulerError } = await admin.rpc("blog_scheduler_is_enabled");
    if (schedulerError || ready !== true) return NextResponse.json({ error: "Scheduling is paused until the publication worker is verified and activated. Save a draft instead." }, { status: 503 });
  }

  const contentRes = blogContentJsonSchema.safeParse(parsed.data.content_json);
  if (!contentRes.success) {
    return NextResponse.json(
      { error: "Invalid content_json.", details: contentRes.error.flatten() },
      { status: 400 },
    );
  }

  const content = contentRes.data;
  warnIfSerializedBlogBodyContainsLegacyManualClusterRelatedGuidesMarkdown(content, {
    slug: parsed.data.slug,
    source: "admin_blog_posts_PUT",
  });

  const { id, ...fields } = parsed.data;
  let row: Record<string, unknown>;
  try {
    row = buildRow(fields, content);
    if (fields.seo_internal_link_context === undefined) row.seo_internal_link_context = previous.seo_internal_link_context;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "scheduled_requires_published_at") {
      return NextResponse.json({ error: "Scheduled posts require a valid future publish date (Africa/Johannesburg)." }, { status: 400 });
    }
    return NextResponse.json({ error: ({ unsupported_image: "Unsupported image URL. Upload the image or use an approved image host.", redirect_only_slug: "This slug is retired and redirects to its canonical page. Choose a new slug.", self_canonical_required: "Canonical must be this post’s own https://shalean.co.za/blog/{slug} URL." } as Record<string,string>)[msg] ?? "Invalid post settings." }, { status: 400 });
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

  if (parsed.data.status === "published" || parsed.data.status === "scheduled") {
    const cmsBroken = await validateCmsBlogLinksForAdminSave(admin, {
      slug: slugForInject,
      content: injected,
      canonical_url: row.canonical_url == null ? null : String(row.canonical_url),
      related_guide_override_slugs: Array.isArray(row.related_guide_override_slugs)
        ? (row.related_guide_override_slugs as string[])
        : null,
      status: parsed.data.status,
    });
    if (cmsBroken.length) {
      return NextResponse.json(
        {
          error: "CMS internal blog link validation failed.",
          code: "cms_link_validation",
          broken: cmsBroken,
        },
        { status: 400 },
      );
    }
  }

  let publishGovernanceResultPut: ReturnType<typeof validateBlogPublish> | null = null;
  if (parsed.data.status !== "draft") {
    publishGovernanceResultPut = await runPublishGovernanceValidation(admin, {
      content: injected,
      tag_ids: parsed.data.tag_ids,
      slug: slugForInject,
      title: String(row.title ?? ""),
      primary_keyword: row.primary_keyword == null ? null : String(row.primary_keyword),
      semantic_cluster: row.semantic_cluster == null ? null : String(row.semantic_cluster),
    });
    if (publishGovernanceResultPut.warnings.length) {
      console.warn("[admin/blog PUT] Publish governance warnings", {
        slug: slugForInject,
        warnings: publishGovernanceResultPut.warnings,
      });
    }
    if (!publishGovernanceResultPut.ok) {
      console.warn("[admin/blog PUT] Publish validation failed", {
        slug: slugForInject,
        issues: publishGovernanceResultPut.issues,
      });
      return NextResponse.json(
        { error: "Publish validation failed.", validation: publishGovernanceResultPut },
        { status: 400 },
      );
    }
  }

  return persistPost(admin, saveAuth.user.id, parsed.data, row, publishGovernanceResultPut, previous);
}

async function persistPost(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, actorId: string,
  input: z.infer<typeof createSchema> & { id?: string; expected_updated_at?: string },
  row: Record<string, unknown>, governance: ReturnType<typeof validateBlogPublish> | null,
  previous?: Record<string, unknown>,
) {
  const { data, error } = await admin.rpc("blog_save_post", {
    p_actor_id: actorId, p_request_id: input.request_id,
    p_payload_hash: createHash("sha256").update(JSON.stringify(input)).digest("hex"),
    p_row: { ...row, scheduled_by: input.status === "scheduled" ? actorId : null, last_schedule_error: null }, p_post_id: input.id ?? null,
    p_expected_updated_at: input.expected_updated_at ?? null, p_tag_ids: input.tag_ids ?? null,
  });
  if (error) {
    const conflict = /blog_revision_conflict|blog_request_reused/.test(error.message);
    const locked = error.message.includes("blog_published_slug_locked");
    return NextResponse.json({
      error: conflict ? "This post changed after you opened it. Your edits are retained. Open the latest version in another tab and reconcile before saving." : locked ? "A published slug cannot be renamed here. Keep the existing URL or request a governed redirect change." : error.code === "23505" ? "Slug already exists." : "The post and tags were not saved. Please retry.",
      code: conflict ? "revision_conflict" : locked ? "published_slug_locked" : "save_failed",
    }, { status: conflict || locked || error.code === "23505" ? 409 : error.code === "42501" ? 403 : 500 });
  }
  const result = data as { post: Record<string, unknown>; receipt: Record<string, unknown> };
  revalidateBlog(String(result.post.slug), previous?.slug == null ? undefined : String(previous.slug));
  return NextResponse.json({ ...result, draft_preview_query: createBlogPreviewQuery(String(result.post.slug), actorId), governance_warnings: governance?.warnings ?? [] }, { status: input.id ? 200 : 201 });
}
