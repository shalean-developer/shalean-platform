import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/api/admin-auth-request";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildBlogDraftPreviewQuery, buildBlogPostViewPath } from "@/lib/blog/build-blog-post-view-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const { data, error } = await admin.from("blog_posts").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { data: tagRows, error: tagErr } = await admin.from("blog_post_tags").select("tag_id").eq("post_id", id);
  if (tagErr) return NextResponse.json({ error: tagErr.message }, { status: 500 });

  const tag_ids = (tagRows ?? []).map((r) => String((r as { tag_id: string }).tag_id));

  const postStatus = String(data.status ?? "draft") as "draft" | "published" | "scheduled";
  const draftPreviewQuery = buildBlogDraftPreviewQuery();
  const view_url = buildBlogPostViewPath(String(data.slug ?? ""), postStatus, draftPreviewQuery);

  return NextResponse.json({
    post: { ...data, tag_ids },
    view_url,
    draft_preview_query: draftPreviewQuery,
  });
}
