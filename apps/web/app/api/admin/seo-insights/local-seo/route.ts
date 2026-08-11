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

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function healthFor(input: {
  gbpConnected: boolean;
  gbpHealth: string;
  reviews: number;
  rating: number | null;
  localPack: number | null;
  clicks: number;
}): "healthy" | "watch" | "action" | "unknown" {
  if (!input.gbpConnected) return "action";
  if (["degraded", "error"].includes(input.gbpHealth.toLowerCase())) return "action";
  if (input.rating != null && input.rating < 4.2) return "action";
  if (input.localPack != null && input.localPack > 10) return "action";
  if (input.gbpHealth === "unknown" || input.reviews < 10 || input.clicks === 0 || input.localPack == null) return "watch";
  return "healthy";
}

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const [visibilityRes, gscRes, socialRes] = await Promise.all([
    admin.from("seo_local_visibility").select("*").order("area_name", { ascending: true }),
    admin.from("site_gsc_metrics").select("page_url,clicks,impressions,avg_position"),
    admin.from("social_accounts").select("provider,location_id,location_name,status,health,last_sync").eq("provider", "google_business").maybeSingle(),
  ]);
  if (visibilityRes.error) return NextResponse.json({ error: visibilityRes.error.message }, { status: 500 });
  if (gscRes.error) return NextResponse.json({ error: gscRes.error.message }, { status: 500 });
  if (socialRes.error) return NextResponse.json({ error: socialRes.error.message }, { status: 500 });

  const rows = visibilityRes.data ?? [];
  const locations = gscRes.data ?? [];
  const social = socialRes.data;

  const gscByPath = new Map<string, { clicks:number; impressions:number; position:number|null }>();
  for (const row of locations) {
    const path = normalizePath(row.page_url);
    if (!path) continue;
    gscByPath.set(path, {
      clicks: Number(row.clicks ?? 0),
      impressions: Number(row.impressions ?? 0),
      position: typeof row.avg_position === "number" ? row.avg_position : null,
    });
  }

  const data = rows.map((row) => {
    const path = row.location_path ? normalizePath(row.location_path) : null;
    const gsc = path ? gscByPath.get(path) : undefined;
    const gbpConnected = Boolean(row.gbp_connected || (social && social.status === "connected"));
    const gbpHealth = String(social?.health ?? "unknown");
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
      health: healthFor({
        gbpConnected,
        gbpHealth,
        reviews: Number(row.review_count ?? 0),
        rating,
        localPack,
        clicks,
      }),
      gbp_last_sync: social?.last_sync ?? null,
      gbp_account_health: gbpHealth,
    };
  });

  return NextResponse.json({
    summary: {
      areas: data.length,
      healthy: data.filter(r => r.health === "healthy").length,
      watch: data.filter(r => r.health === "watch").length,
      action: data.filter(r => r.health === "action").length,
      gbpConnected: Boolean(social && social.status === "connected"),
      gbpHealth: String(social?.health ?? "unknown"),
      gbpLastSync: social?.last_sync ?? null,
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

  const locationPath = normalizePath(body.location_path);
  let resolvedGsc: { clicks:number; impressions:number; position:number|null } | null = null;
  if (locationPath) {
    const { data: gscRows, error: gscError } = await admin
      .from("site_gsc_metrics")
      .select("page_url,clicks,impressions,avg_position");
    if (gscError) return NextResponse.json({ error: gscError.message }, { status: 500 });
    const match = (gscRows ?? []).find((row) => normalizePath(row.page_url) === locationPath);
    if (match) {
      resolvedGsc = {
        clicks: Number(match.clicks ?? 0),
        impressions: Number(match.impressions ?? 0),
        position: typeof match.avg_position === "number" ? match.avg_position : null,
      };
    }
  }

  const reviewCount = optionalNumber(body.review_count);
  const averageRating = optionalNumber(body.average_rating);
  const localPackPosition = optionalNumber(body.local_pack_position);

  const payload = {
    area_name: areaName,
    location_path: locationPath,
    gbp_location_id: typeof body.gbp_location_id === "string" && body.gbp_location_id.trim() ? body.gbp_location_id.trim() : null,
    gbp_location_name: typeof body.gbp_location_name === "string" && body.gbp_location_name.trim() ? body.gbp_location_name.trim() : null,
    gbp_connected: Boolean(body.gbp_connected),
    review_count: reviewCount == null ? 0 : Math.max(0, Math.round(reviewCount)),
    average_rating: averageRating,
    local_pack_position: localPackPosition,
    local_pack_keyword: typeof body.local_pack_keyword === "string" && body.local_pack_keyword.trim() ? body.local_pack_keyword.trim() : null,
    notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
    gsc_clicks: resolvedGsc?.clicks ?? 0,
    gsc_impressions: resolvedGsc?.impressions ?? 0,
    gsc_avg_position: resolvedGsc?.position ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin.from("seo_local_visibility").upsert(payload, { onConflict:"area_name" }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { error: snapshotError } = await admin.from("seo_local_visibility_snapshots").insert({
    area_name: data.area_name,
    location_path: data.location_path,
    gbp_location_id: data.gbp_location_id,
    review_count: data.review_count,
    average_rating: data.average_rating,
    local_pack_position: data.local_pack_position,
    local_pack_keyword: data.local_pack_keyword,
    gsc_clicks: resolvedGsc?.clicks ?? Number(data.gsc_clicks ?? 0),
    gsc_impressions: resolvedGsc?.impressions ?? Number(data.gsc_impressions ?? 0),
    gsc_avg_position: resolvedGsc?.position ?? data.gsc_avg_position ?? null,
  });
  if (snapshotError) return NextResponse.json({ error: snapshotError.message }, { status: 500 });

  return NextResponse.json({ row:data });
}
