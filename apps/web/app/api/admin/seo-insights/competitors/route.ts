import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeDomain(value: string): string | null {
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const [{ data: competitors, error: competitorError }, { data: keywords, error: keywordError }, { data: snapshots, error: snapshotError }] = await Promise.all([
    admin.from("seo_competitors").select("id,name,domain,source,active,ignored,notes,created_at,updated_at").order("created_at", { ascending: true }),
    admin.from("seo_tracked_keywords").select("id,keyword,target_path,location_name,language_code,device,priority,active,created_at,updated_at").order("priority", { ascending: true }).order("keyword", { ascending: true }),
    admin.from("seo_serp_snapshots").select("id,keyword_id,provider,fetched_at,result_count").order("fetched_at", { ascending: false }).limit(200),
  ]);
  const error = competitorError || keywordError || snapshotError;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const keywordIds = (keywords ?? []).map((row) => row.id);
  const { data: rankings, error: rankingError } = keywordIds.length
    ? await admin.from("seo_competitor_rankings").select("keyword_id,domain,position,url,title,is_shalean,created_at").in("keyword_id", keywordIds).order("created_at", { ascending: false }).limit(5000)
    : { data: [], error: null };
  if (rankingError) return NextResponse.json({ error: rankingError.message }, { status: 500 });

  const latestSnapshotByKeyword = new Map<string, string>();
  for (const snapshot of snapshots ?? []) if (!latestSnapshotByKeyword.has(snapshot.keyword_id)) latestSnapshotByKeyword.set(snapshot.keyword_id, snapshot.id);
  const snapshotIds = new Set(latestSnapshotByKeyword.values());
  const latestRankings = (rankings ?? []).filter((row: any) => {
    const latest = latestSnapshotByKeyword.get(row.keyword_id);
    if (!latest) return false;
    return snapshotIds.has(latest);
  });

  // Fetch exact latest-snapshot ranking rows so historical rows never contaminate the comparison.
  const { data: latestRows } = snapshotIds.size
    ? await admin.from("seo_competitor_rankings").select("snapshot_id,keyword_id,domain,position,url,title,is_shalean,created_at").in("snapshot_id", [...snapshotIds]).order("position", { ascending: true })
    : { data: [] as any[] };

  const competitorDomains = new Set((competitors ?? []).map((row) => row.domain));
  const ignoredDomains = new Set((competitors ?? []).filter((row) => row.ignored).map((row) => row.domain));
  const discovery = new Map<string, { domain: string; appearances: number; best_position: number }>();
  for (const row of latestRows ?? []) {
    if (row.is_shalean || competitorDomains.has(row.domain) || ignoredDomains.has(row.domain)) continue;
    const current = discovery.get(row.domain) ?? { domain: row.domain, appearances: 0, best_position: 999 };
    current.appearances += 1;
    current.best_position = Math.min(current.best_position, row.position);
    discovery.set(row.domain, current);
  }

  const comparisons = (keywords ?? []).map((keyword) => {
    const rows = (latestRows ?? []).filter((row) => row.keyword_id === keyword.id);
    const shalean = rows.find((row) => row.is_shalean) ?? null;
    const competitorsForKeyword = rows.filter((row) => competitorDomains.has(row.domain));
    const leader = [...competitorsForKeyword].sort((a, b) => a.position - b.position)[0] ?? null;
    return {
      keyword_id: keyword.id,
      keyword: keyword.keyword,
      target_path: keyword.target_path,
      location_name: keyword.location_name,
      device: keyword.device,
      priority: keyword.priority,
      shalean_position: shalean?.position ?? null,
      shalean_url: shalean?.url ?? null,
      best_competitor_domain: leader?.domain ?? null,
      best_competitor_position: leader?.position ?? null,
      gap: shalean && leader ? shalean.position - leader.position : null,
    };
  });

  const visibility = (competitors ?? []).filter((row) => row.active && !row.ignored).map((competitor) => {
    const domainRows = (latestRows ?? []).filter((row) => row.domain === competitor.domain);
    const score = domainRows.reduce((sum, row) => sum + Math.max(0, 101 - row.position), 0);
    return { id: competitor.id, name: competitor.name, domain: competitor.domain, appearances: domainRows.length, visibility_score: score };
  });
  const shaleanRows = (latestRows ?? []).filter((row) => row.is_shalean);
  const shaleanVisibility = shaleanRows.reduce((sum, row) => sum + Math.max(0, 101 - row.position), 0);
  const totalVisibility = shaleanVisibility + visibility.reduce((sum, row) => sum + row.visibility_score, 0);

  return NextResponse.json({
    competitors: competitors ?? [],
    keywords: keywords ?? [],
    latest_snapshots: snapshots ?? [],
    comparisons,
    suggested_competitors: [...discovery.values()].sort((a, b) => b.appearances - a.appearances || a.best_position - b.best_position).slice(0, 20),
    visibility: {
      shalean: { domain: "shalean.co.za", visibility_score: shaleanVisibility, share_of_voice: totalVisibility ? shaleanVisibility / totalVisibility : 0 },
      competitors: visibility.map((row) => ({ ...row, share_of_voice: totalVisibility ? row.visibility_score / totalVisibility : 0 })),
    },
    provider_configured: Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const body = await request.json().catch(() => ({}));

  if (body.action === "add_competitor") {
    const domain = normalizeDomain(String(body.domain ?? ""));
    if (!domain || domain === "shalean.co.za") return NextResponse.json({ error: "Enter a valid competitor domain." }, { status: 400 });
    const name = String(body.name ?? domain).trim() || domain;
    const { data, error } = await admin.from("seo_competitors").upsert({ name, domain, source: body.source === "discovered" ? "discovered" : "manual", active: true, ignored: false }, { onConflict: "domain" }).select().single();
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ competitor: data });
  }

  if (body.action === "ignore_competitor") {
    const domain = normalizeDomain(String(body.domain ?? ""));
    if (!domain) return NextResponse.json({ error: "Invalid domain." }, { status: 400 });
    const { data, error } = await admin.from("seo_competitors").upsert({ name: domain, domain, source: "discovered", active: false, ignored: true }, { onConflict: "domain" }).select().single();
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ competitor: data });
  }

  if (body.action === "add_keyword") {
    const keyword = String(body.keyword ?? "").trim();
    if (!keyword) return NextResponse.json({ error: "Keyword is required." }, { status: 400 });
    const row = {
      keyword,
      target_path: String(body.target_path ?? "").trim() || null,
      location_name: String(body.location_name ?? "Cape Town, Western Cape, South Africa").trim(),
      language_code: "en",
      device: body.device === "mobile" ? "mobile" : "desktop",
      priority: ["p0","p1","p2"].includes(body.priority) ? body.priority : "p1",
      active: true,
    };
    const { data, error } = await admin.from("seo_tracked_keywords").upsert(row, { onConflict: "keyword,location_name,device" }).select().single();
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ keyword: data });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
