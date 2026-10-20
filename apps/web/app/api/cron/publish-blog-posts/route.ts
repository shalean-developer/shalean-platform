import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/verifyCronSecret";
import { CRON_LOCK_KEYS } from "@/lib/cron/cronLockKeys";
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
    const result = await withCronLock(admin, { jobName: CRON_LOCK_KEYS.publishBlogPosts, leaseSeconds: 240 }, () => publishScheduledBlogPosts(admin, revalidateBlog));
    if (result.skipped) return NextResponse.json({ ok: true, skipped: true, reason: result.reason });
    return NextResponse.json(result);
  } catch { return NextResponse.json({ error: "Blog publication worker failed; no unvalidated posts were released." }, { status: 500 }); }
}
