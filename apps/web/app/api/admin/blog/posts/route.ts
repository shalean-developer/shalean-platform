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
  /** Canonical governance cluster (`blog_posts.semantic_cluster`); invalid values stored as null. */
  semantic_cluster: z.string().nullable().optional(),
  /** Pin/order slugs in the public cluster related-guides footer (max 8; invalid slugs dropped on save). */
  related_guide_override_slugs: z.array(z.string()).max(8).optional(),
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

async function blogTagSlugsForIds(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  tagIds: string[] | undefined,
): Promise<string[]> {
  if (!tagIds?.length) return [];
  const { data, error } = await admin.from("blog_tags").select("slug").in("id", tagIds);
  if (error || !data) return [];
  return (data as { slug?: string }[]).map((r) => String(r.slug ?? ""));
}

async function runPublishGovernanceValidation(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  params: {
    content: BlogContentJson;
    tag_ids: string[] | undefined;
    slug: string;
    title: string;
    primary_keyword: string | null;
    semantic_cluster?: string | null;
  },
) {
  const tagSlugs = await blogTagSlugsForIds(admin, params.tag_ids);
  const semanticKey = resolveSemanticClusterKey({
    persisted: params.semantic_cluster,
    tags: tagSlugs,
  });
  const clusterTagForLegacy = semanticClusterKeyToCollisionTagSlug(semanticKey);
  let clusterPeers: ClusterPeerPost[] = [];
  if (params.slug.trim() && (semanticKey || clusterTagForLegacy)) {
    clusterPeers = await fetchPublishedClusterPeersUnified(admin, {
      excludeSlug: params.slug.trim(),
      semanticClusterKey: semanticKey,
      clusterTagSlug: clusterTagForLegacy,
    });
  }
  return validateBlogPublish(params.content, {
    tags: tagSlugs,
    semanticCluster: semanticKey ?? undefined,
    clusterPeers,
    slug: params.slug.trim(),
    title: params.title.trim(),
    primaryKeyword: params.primary_keyword,
    collisionClusterTagSlug: clusterTagForLegacy ?? undefined,
  });
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
    canonical_url: normalizeEmpty(input.canonical_url),
    featured_image_url,
    featured_image_alt,
    noindex: Boolean(input.noindex),
    content_json: content,
    reading_time_minutes,
    primary_keyword: pk,
    secondary_keywords: sec.length ? sec : null,
    search_intent: intent,
    seo_internal_link_context: seo_internal_link_context as Record<string, unknown> | null,
    category_id: input.category_id ?? null,
    semantic_cluster: normalizeSemanticClusterInput(input.semantic_cluster),
    related_guide_override_slugs: normalizeManualRelatedGuideSlugs(input.related_guide_override_slugs, 8),
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
  if (parsed.data.status === "published") {
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

  return NextResponse.json(
    {
      post: data,
      ...(publishGovernanceResult ? { governance_warnings: publishGovernanceResult.warnings } : {}),
    },
    { status: 201 },
  );
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

  const content = contentRes.data;
  warnIfSerializedBlogBodyContainsLegacyManualClusterRelatedGuidesMarkdown(content, {
    slug: parsed.data.slug,
    source: "admin_blog_posts_PUT",
  });

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
  if (parsed.data.status === "published") {
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

  return NextResponse.json({
    post: data,
    ...(publishGovernanceResultPut ? { governance_warnings: publishGovernanceResultPut.warnings } : {}),
  });
}
