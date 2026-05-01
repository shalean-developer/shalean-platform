import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminRequest } from "@/lib/api/admin-auth-request";
import { computeReadingTimeMinutes } from "@/lib/blog/compute-reading-time";
import { blogContentJsonSchema } from "@/lib/blog/content-json-schema";
import type { BlogContentJson } from "@/lib/blog/content-json";
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
});

const createSchema = basePostSchema;
const updateSchema = basePostSchema.extend({ id: z.string().uuid() });

function normalizeEmpty(s?: string | null): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t === "" ? null : t;
}

function buildRow(
  input: z.infer<typeof basePostSchema>,
  content: BlogContentJson,
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

  return {
    slug: input.slug.trim(),
    title: input.title.trim(),
    h1: normalizeEmpty(input.h1),
    excerpt: normalizeEmpty(input.excerpt),
    status: input.status,
    source: input.source,
    published_at,
    meta_title: normalizeEmpty(input.meta_title),
    meta_description: normalizeEmpty(input.meta_description),
    canonical_url: normalizeEmpty(input.canonical_url),
    featured_image_url: normalizeEmpty(input.featured_image_url),
    featured_image_alt: normalizeEmpty(input.featured_image_alt),
    noindex: Boolean(input.noindex),
    content_json: content,
    reading_time_minutes,
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

  let row: Record<string, unknown>;
  try {
    row = buildRow(parsed.data, contentRes.data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "scheduled_requires_published_at") {
      return NextResponse.json({ error: "Scheduled posts require a publish date." }, { status: 400 });
    }
    throw e;
  }

  const { data, error } = await admin.from("blog_posts").insert(row).select("id,slug").single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Slug already exists." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
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

  const { id, ...fields } = parsed.data;
  let row: Record<string, unknown>;
  try {
    row = buildRow(fields, contentRes.data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "scheduled_requires_published_at") {
      return NextResponse.json({ error: "Scheduled posts require a publish date." }, { status: 400 });
    }
    throw e;
  }

  const { data, error } = await admin.from("blog_posts").update(row).eq("id", id).select("id,slug").maybeSingle();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Slug already exists." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ post: data });
}
