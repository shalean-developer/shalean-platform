import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed, "https://shalean.co.za").pathname.replace(/\/+$/, "") || "/";
  } catch {
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }
}

function healthFor(input: { gbpConnected:boolean; reviews:number; rating:number|null; localPack:number|null; clicks:number }): "healthy"|"watch"|"action"|"unknown" {
  if (!input.gbpConnected) return "action";
  if (input.rating != null && input.rating < 4.2) return "action";
  if (input.localPack != null && input.localPack > 10) return "action";
  if (input.reviews < 10 || input.clicks === 0 || input.localPack == null) return "watch";
  return "healthy";
}

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const [{ data: rows, error }, { data: locations }, { data: social }] = await Promise.all([
    admin.from("seo_local_visibility").select("*").order("area_name", { ascending: true }),
    admin.from("site_gsc_metrics").select("page_url,clicks,impressions,avg_position"),
    admin.from("social_accounts").select("provider,location_id,location_name,status,health,last_sync").eq("provider", "google_business").maybeSingle(),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const gscByPath = new Map<string,{clicks:number;impressions:number;position:number|null}>();
  for (const row of locations ?? []) {
    try {
      const path = new URL(row.page_url).pathname.replace(/\/+$/, "") || "/";
      gscByPath.set(path, { clicks:Number(row.clicks ?? 0), impressions:Number(row.impressions ?? 0), position:typeof row.avg_position === "number" ? row.avg_position : null });
    } catch {}
  }

  const data = (rows ?? []).map((row) => {
    const path = row.location_path ? normalizePath(row.location_path) : null;
    const gsc = path ? gscByPath.get(path) : undefined;
    const gbpConnected = Boolean(row.gbp_connected || (social && social.status === "connected"));
    const clicks = gsc?.clicks ?? Number(row.gsc_clicks ?? 0);
    const impressions = gsc?.impressions ?? Number(row.gsc_impressions ?? 0);
    const position = gsc?.position ?? (typeof row.gsc_avg_position === "number" ? row.gsc_avg_position : null);
    const rating = typeof row.average_rating === "number" ? row.average_rating : null;
    const localPack = typeof row.local_pack_position === "number" ? row.local_pack_position : null;
    return {
      ...row,
      gbp_connected: gbpConnected,
      gbp_location_id: row.gbp_location_id ?? social?.location_id ?? null,
      gbp_location_name: row.gbp_location_name ?? social?.location_name ?? null,
      gsc_clicks: clicks,
      gsc_impressions: impressions,
      gsc_avg_position: position,
      health: healthFor({ gbpConnected, reviews:Number(row.review_count ?? 0), rating, localPack, clicks }),
      gbp_last_sync: social?.last_sync ?? null,
      gbp_account_health: social?.health ?? "unknown",
    };
  });

  return NextResponse.json({
    summary: {
      areas: data.length,
      healthy: data.filter(r => r.health === "healthy").length,
      watch: data.filter(r => r.health === "watch").length,
      action: data.filter(r => r.health === "action").length,
      gbpConnected: Boolean(social && social.status === "connected"),
    },
    rows: data,
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const areaName = typeof body.area_name === "string" ? body.area_name.trim() : "";
  if (!areaName) return NextResponse.json({ error: "Area name is required." }, { status: 400 });
  const payload = {
    area_name: areaName,
    location_path: normalizePath(body.location_path),
    gbp_location_id: typeof body.gbp_location_id === "string" && body.gbp_location_id.trim() ? body.gbp_location_id.trim() : null,
    gbp_location_name: typeof body.gbp_location_name === "string" && body.gbp_location_name.trim() ? body.gbp_location_name.trim() : null,
    gbp_connected: Boolean(body.gbp_connected),
    review_count: Number.isFinite(Number(body.review_count)) ? Math.max(0, Math.round(Number(body.review_count))) : 0,
    average_rating: Number.isFinite(Number(body.average_rating)) ? Number(body.average_rating) : null,
    local_pack_position: Number.isFinite(Number(body.local_pack_position)) ? Number(body.local_pack_position) : null,
    local_pack_keyword: typeof body.local_pack_keyword === "string" && body.local_pack_keyword.trim() ? body.local_pack_keyword.trim() : null,
    notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await admin.from("seo_local_visibility").upsert(payload, { onConflict:"area_name" }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from("seo_local_visibility_snapshots").insert({
    area_name: data.area_name,
    location_path: data.location_path,
    gbp_location_id: data.gbp_location_id,
    review_count: data.review_count,
    average_rating: data.average_rating,
    local_pack_position: data.local_pack_position,
    local_pack_keyword: data.local_pack_keyword,
    gsc_clicks: data.gsc_clicks ?? 0,
    gsc_impressions: data.gsc_impressions ?? 0,
    gsc_avg_position: data.gsc_avg_position,
  });
  return NextResponse.json({ row:data });
}
