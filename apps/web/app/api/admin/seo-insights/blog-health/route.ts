import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BlogPost = {
  id: string;
  slug: string;
  title: string;
  meta_title: string | null;
  meta_description: string | null;
  primary_keyword: string | null;
  semantic_cluster: string | null;
  noindex: boolean | null;
  published_at: string | null;
};

type GscRow = {
  page_url: string;
  clicks: number;
  impressions: number;
  avg_position: number | null;
  prev_clicks: number;
  prev_impressions: number;
  prev_avg_position: number | null;
};

function normalizeIntent(value: string | null): string | null {
  const normalized = value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return normalized || null;
}

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const now = new Date().toISOString();
  const [{ data: posts, error: postError }, { data: gscRows, error: gscError }] = await Promise.all([
    admin
      .from("blog_posts")
      .select("id,slug,title,meta_title,meta_description,primary_keyword,semantic_cluster,noindex,published_at")
      .eq("status", "published")
      .lte("published_at", now)
      .order("published_at", { ascending: false })
      .limit(1000),
    admin
      .from("site_gsc_metrics")
      .select("page_url,clicks,impressions,avg_position,prev_clicks,prev_impressions,prev_avg_position")
      .eq("page_group", "blog")
      .limit(1000),
  ]);

  if (postError) return NextResponse.json({ error: postError.message }, { status: 500 });
  if (gscError) return NextResponse.json({ error: gscError.message }, { status: 500 });

  const metricsBySlug = new Map<string, GscRow>();
  for (const row of (gscRows ?? []) as GscRow[]) {
    try {
      const pathname = new URL(row.page_url).pathname.replace(/\/$/, "");
      const match = pathname.match(/^\/blog\/([^/]+)$/);
      if (match) metricsBySlug.set(decodeURIComponent(match[1]), row);
    } catch {
      // Ignore malformed Search Console URLs.
    }
  }

  const intentOwners = new Map<string, string[]>();
  for (const post of (posts ?? []) as BlogPost[]) {
    const intent = normalizeIntent(post.primary_keyword) ?? normalizeIntent(post.title);
    if (!intent) continue;
    intentOwners.set(intent, [...(intentOwners.get(intent) ?? []), post.slug]);
  }

  const rows = ((posts ?? []) as BlogPost[]).map((post) => {
    const gsc = metricsBySlug.get(post.slug) ?? null;
    const intent = normalizeIntent(post.primary_keyword) ?? normalizeIntent(post.title);
    const competingSlugs = intent ? (intentOwners.get(intent) ?? []).filter((slug) => slug !== post.slug) : [];
    const issues: Array<{ code: string; severity: "high" | "medium" | "low"; message: string }> = [];

    if (!post.meta_title?.trim()) issues.push({ code: "missing_meta_title", severity: "high", message: "Add a unique SEO title." });
    if (!post.meta_description?.trim()) issues.push({ code: "missing_meta_description", severity: "high", message: "Add a search-focused meta description." });
    if (!post.primary_keyword?.trim()) issues.push({ code: "missing_primary_keyword", severity: "medium", message: "Assign a primary keyword so intent can be governed." });
    if (post.noindex) issues.push({ code: "published_noindex", severity: "high", message: "Published post is noindex; confirm this is intentional." });
    if (competingSlugs.length) issues.push({ code: "cannibalisation", severity: "high", message: `Competes for the same primary intent with ${competingSlugs.join(", ")}.` });

    if (gsc && gsc.prev_impressions >= 20) {
      if (gsc.clicks < gsc.prev_clicks * 0.7) issues.push({ code: "declining_clicks", severity: "high", message: `Clicks declined from ${gsc.prev_clicks} to ${gsc.clicks}.` });
      if (gsc.impressions < gsc.prev_impressions * 0.7) issues.push({ code: "declining_impressions", severity: "medium", message: `Impressions declined from ${gsc.prev_impressions} to ${gsc.impressions}.` });
      if (gsc.avg_position != null && gsc.prev_avg_position != null && gsc.avg_position - gsc.prev_avg_position >= 3) {
        issues.push({ code: "ranking_decline", severity: "medium", message: `Average position declined by ${(gsc.avg_position - gsc.prev_avg_position).toFixed(1)} places.` });
      }
    }

    return {
      id: post.id,
      slug: post.slug,
      title: post.title,
      primary_keyword: post.primary_keyword,
      semantic_cluster: post.semantic_cluster,
      published_at: post.published_at,
      gsc,
      issues,
      health: issues.some((issue) => issue.severity === "high") ? "critical" : issues.length ? "warning" : "healthy",
    };
  });

  const rank = { critical: 0, warning: 1, healthy: 2 } as const;
  rows.sort((a, b) => rank[a.health] - rank[b.health] || b.issues.length - a.issues.length);

  return NextResponse.json({
    summary: {
      published: rows.length,
      critical: rows.filter((row) => row.health === "critical").length,
      warning: rows.filter((row) => row.health === "warning").length,
      healthy: rows.filter((row) => row.health === "healthy").length,
      cannibalisation: rows.filter((row) => row.issues.some((issue) => issue.code === "cannibalisation")).length,
      declining: rows.filter((row) => row.issues.some((issue) => issue.code.startsWith("declining_") || issue.code === "ranking_decline")).length,
    },
    rows,
  });
}
