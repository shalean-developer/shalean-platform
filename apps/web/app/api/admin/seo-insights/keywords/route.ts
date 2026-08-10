import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const [{ data: keywords, error }, { data: siteMetrics }] = await Promise.all([
    admin.from("seo_tracked_keywords")
      .select("id,keyword,target_path,service_name,location_name,language_code,device,priority,intent,baseline_rank,target_rank,owner_email,notes,active,created_at,updated_at")
      .order("priority", { ascending: true })
      .order("keyword", { ascending: true }),
    admin.from("site_gsc_metrics").select("page_url,avg_position,impressions,clicks"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const pathMetrics = new Map<string, { position:number|null; impressions:number; clicks:number }>();
  for (const row of siteMetrics ?? []) {
    try {
      const path = new URL(row.page_url).pathname.replace(/\/+$/, "") || "/";
      pathMetrics.set(path, {
        position: typeof row.avg_position === "number" ? row.avg_position : null,
        impressions: row.impressions ?? 0,
        clicks: row.clicks ?? 0,
      });
    } catch {}
  }

  const byTarget = new Map<string, string[]>();
  for (const row of keywords ?? []) {
    if (!row.active || !row.target_path) continue;
    const list = byTarget.get(row.target_path) ?? [];
    list.push(row.keyword);
    byTarget.set(row.target_path, list);
  }

  const rows = (keywords ?? []).map((row) => {
    const current = row.target_path ? pathMetrics.get(row.target_path) : undefined;
    const duplicateKeywords = row.target_path ? (byTarget.get(row.target_path) ?? []).filter(k => k !== row.keyword) : [];
    return {
      ...row,
      current_rank: current?.position ?? null,
      current_impressions: current?.impressions ?? 0,
      current_clicks: current?.clicks ?? 0,
      missing_target_page: !row.target_path,
      target_page_has_gsc: row.target_path ? pathMetrics.has(row.target_path) : false,
      shared_target_keywords: duplicateKeywords,
    };
  });

  return NextResponse.json({
    summary: {
      total: rows.length,
      active: rows.filter(r => r.active).length,
      missingTarget: rows.filter(r => r.active && r.missing_target_page).length,
      withGoal: rows.filter(r => r.active && r.target_rank != null).length,
      withoutBaseline: rows.filter(r => r.active && r.baseline_rank == null).length,
    },
    rows,
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const keyword = typeof body.keyword === "string" ? body.keyword.trim() : "";
  if (!keyword) return NextResponse.json({ error: "Keyword is required." }, { status: 400 });

  const payload = {
    keyword,
    target_path: normalizePath(body.target_path),
    service_name: typeof body.service_name === "string" && body.service_name.trim() ? body.service_name.trim() : null,
    location_name: typeof body.location_name === "string" && body.location_name.trim() ? body.location_name.trim() : "Cape Town, Western Cape, South Africa",
    language_code: "en",
    device: body.device === "mobile" ? "mobile" : "desktop",
    priority: ["p0","p1","p2"].includes(body.priority) ? body.priority : "p1",
    intent: ["transactional","commercial","informational","navigational","local"].includes(body.intent) ? body.intent : null,
    baseline_rank: Number.isFinite(Number(body.baseline_rank)) ? Number(body.baseline_rank) : null,
    target_rank: Number.isFinite(Number(body.target_rank)) ? Number(body.target_rank) : null,
    owner_email: auth.email ?? null,
    notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
    active: true,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin.from("seo_tracked_keywords").insert(payload).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ row: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Keyword id is required." }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("target_path" in body) patch.target_path = normalizePath(body.target_path);
  if ("service_name" in body) patch.service_name = typeof body.service_name === "string" && body.service_name.trim() ? body.service_name.trim() : null;
  if ("location_name" in body) patch.location_name = typeof body.location_name === "string" && body.location_name.trim() ? body.location_name.trim() : "Cape Town, Western Cape, South Africa";
  if ("device" in body && ["desktop","mobile"].includes(body.device)) patch.device = body.device;
  if ("priority" in body && ["p0","p1","p2"].includes(body.priority)) patch.priority = body.priority;
  if ("intent" in body) patch.intent = ["transactional","commercial","informational","navigational","local"].includes(body.intent) ? body.intent : null;
  if ("baseline_rank" in body) patch.baseline_rank = Number.isFinite(Number(body.baseline_rank)) ? Number(body.baseline_rank) : null;
  if ("target_rank" in body) patch.target_rank = Number.isFinite(Number(body.target_rank)) ? Number(body.target_rank) : null;
  if ("notes" in body) patch.notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
  if ("active" in body) patch.active = Boolean(body.active);
  patch.owner_email = auth.email ?? null;

  const { error } = await admin.from("seo_tracked_keywords").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
