import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTENTS = ["transactional","commercial","informational","navigational","local"] as const;
const PRIORITIES = ["p0","p1","p2"] as const;
const DEVICES = ["desktop","mobile"] as const;

function normalizePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function nullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
    const normalizedTarget = normalizePath(row.target_path) ?? row.target_path;
    const list = byTarget.get(normalizedTarget) ?? [];
    list.push(row.keyword);
    byTarget.set(normalizedTarget, list);
  }

  const rows = (keywords ?? []).map((row) => {
    const normalizedTarget = row.target_path ? normalizePath(row.target_path) : null;
    const current = normalizedTarget ? pathMetrics.get(normalizedTarget) : undefined;
    const duplicateKeywords = normalizedTarget ? (byTarget.get(normalizedTarget) ?? []).filter(k => k !== row.keyword) : [];
    return {
      ...row,
      target_path: normalizedTarget,
      current_rank: current?.position ?? null,
      current_impressions: current?.impressions ?? 0,
      current_clicks: current?.clicks ?? 0,
      missing_target_page: !normalizedTarget,
      target_page_has_gsc: normalizedTarget ? pathMetrics.has(normalizedTarget) : false,
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
  const keyword = cleanText(body.keyword) ?? "";
  if (!keyword) return NextResponse.json({ error: "Keyword is required." }, { status: 400 });

  const payload = {
    keyword,
    target_path: normalizePath(body.target_path),
    service_name: cleanText(body.service_name),
    location_name: cleanText(body.location_name) ?? "Cape Town, Western Cape, South Africa",
    language_code: "en",
    device: DEVICES.includes(body.device) ? body.device : "desktop",
    priority: PRIORITIES.includes(body.priority) ? body.priority : "p1",
    intent: INTENTS.includes(body.intent) ? body.intent : null,
    baseline_rank: nullableNumber(body.baseline_rank),
    target_rank: nullableNumber(body.target_rank),
    owner_email: auth.email ?? null,
    notes: cleanText(body.notes),
    active: body.active === false ? false : true,
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

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), owner_email: auth.email ?? null };
  if ("keyword" in body) {
    const keyword = cleanText(body.keyword);
    if (!keyword) return NextResponse.json({ error: "Keyword cannot be empty." }, { status: 400 });
    patch.keyword = keyword;
  }
  if ("target_path" in body) patch.target_path = normalizePath(body.target_path);
  if ("service_name" in body) patch.service_name = cleanText(body.service_name);
  if ("location_name" in body) patch.location_name = cleanText(body.location_name) ?? "Cape Town, Western Cape, South Africa";
  if ("device" in body && DEVICES.includes(body.device)) patch.device = body.device;
  if ("priority" in body && PRIORITIES.includes(body.priority)) patch.priority = body.priority;
  if ("intent" in body) patch.intent = INTENTS.includes(body.intent) ? body.intent : null;
  if ("baseline_rank" in body) patch.baseline_rank = nullableNumber(body.baseline_rank);
  if ("target_rank" in body) patch.target_rank = nullableNumber(body.target_rank);
  if ("notes" in body) patch.notes = cleanText(body.notes);
  if ("active" in body) patch.active = Boolean(body.active);

  const { data, error } = await admin.from("seo_tracked_keywords").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, row: data });
}

export async function DELETE(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Keyword id is required." }, { status: 400 });

  // Archive instead of hard-deleting. seo_serp_snapshots references this row with
  // ON DELETE CASCADE, so a hard delete would erase historical SERP/competitor data.
  const { data, error } = await admin.from("seo_tracked_keywords")
    .update({
      active: false,
      target_path: null,
      owner_email: auth.email ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id,active,target_path")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, archived: true, row: data });
}