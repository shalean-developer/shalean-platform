import { NextResponse } from "next/server";
import { requireBlogRead } from "@/lib/blog/admin-blog-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireBlogRead(request);
  if (!auth.ok) return auth.response;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const [cats, tags] = await Promise.all([
    admin.from("blog_categories").select("id,slug,name,sort_order").eq("is_active", true).order("sort_order", { ascending: true }),
    admin.from("blog_tags").select("id,slug,name").order("name", { ascending: true }),
  ]);

  if (cats.error) return NextResponse.json({ error: cats.error.message }, { status: 500 });
  if (tags.error) return NextResponse.json({ error: tags.error.message }, { status: 500 });

  const scheduler = await admin.rpc("blog_scheduler_is_enabled");
  return NextResponse.json({
    scheduling_enabled: !scheduler.error && scheduler.data === true,
    categories: cats.data ?? [],
    tags: tags.data ?? [],
  });
}
