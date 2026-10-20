import { NextResponse } from "next/server";
import { requireBlogRead } from "@/lib/blog/admin-blog-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildEditorLinkTargets, searchEditorLinkTargets } from "@/lib/blog/editor-link-targets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireBlogRead(request);
  if (!auth.ok) return auth.response;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const { data, error } = await admin.from("blog_posts").select("slug,title").eq("status", "published")
    .lte("published_at", new Date().toISOString()).not("content_json", "is", null).order("title");
  if (error) return NextResponse.json({ error: "Live blog destinations could not be loaded. Retry or enter a URL manually." }, { status: 503 });
  const query = new URL(request.url).searchParams.get("q")?.slice(0, 120) ?? "";
  return NextResponse.json({ targets: searchEditorLinkTargets(buildEditorLinkTargets(data ?? []), query) }, { headers: { "Cache-Control": "private, no-store" } });
}
