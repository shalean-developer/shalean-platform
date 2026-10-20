import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/verifyCronSecret";
import { withCronLock } from "@/lib/cron/cronLock";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { publishScheduledBlogPosts } from "@/lib/blog/publish-scheduled-posts";
import { revalidateBlog } from "@/lib/blog/revalidate-blog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  try {
    const result = await withCronLock(admin, { jobName: "cron:publish-blog-posts", leaseSeconds: 240 }, () => publishScheduledBlogPosts(admin, revalidateBlog));
    return NextResponse.json(result);
  } catch { return NextResponse.json({ error: "Blog publication worker failed; no unvalidated posts were released." }, { status: 500 }); }
}
