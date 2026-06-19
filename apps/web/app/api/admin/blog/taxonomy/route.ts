import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/api/admin-auth-request";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildBlogDraftPreviewQuery } from "@/lib/blog/build-blog-post-view-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const [cats, tags] = await Promise.all([
    admin.from("blog_categories").select("id,slug,name,sort_order").eq("is_active", true).order("sort_order", { ascending: true }),
    admin.from("blog_tags").select("id,slug,name").order("name", { ascending: true }),
  ]);

  if (cats.error) return NextResponse.json({ error: cats.error.message }, { status: 500 });
  if (tags.error) return NextResponse.json({ error: tags.error.message }, { status: 500 });

  return NextResponse.json({
    categories: cats.data ?? [],
    tags: tags.data ?? [],
    draft_preview_query: buildBlogDraftPreviewQuery(),
  });
}
