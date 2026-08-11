import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveSessionLanding } from "@/lib/admin/landingPageAttribution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EventRow = { event_type?: string | null; created_at?: string | null; payload?: Record<string, unknown> | null };

type Session = {
  id: string;
  landing: string;
  source: string | null;
  medium: string | null;
  attributionSource: string | null;
  started: boolean;
  completed: boolean;
  bookingId: string | null;
};

const SEARCH_ENGINES = new Set(["google", "bing", "duckduckgo", "yahoo", "ecosia"]);
const PAID_MEDIA = new Set(["cpc", "ppc", "paid", "paid_search", "display"]);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function payload(row: EventRow): Record<string, unknown> {
  return row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {};
}
function sessionId(p: Record<string, unknown>): string | null {
  return text(p.analytics_session_id) ?? text(p.booking_session_id) ?? text(p.session_id);
}
function bookingId(p: Record<string, unknown>): string | null {
  return text(p.booking_id) ?? text(p.bookingId);
}
function isStartEvent(type: string | null | undefined): boolean {
  return ["start_booking", "booking_step_details_started", "booking_service_selected"].includes(String(type ?? ""));
}
function isCompleteEvent(type: string | null | undefined): boolean {
  return ["booking_completed", "complete_booking", "payment_completed"].includes(String(type ?? ""));
}
function isOrganic(s: Session): boolean {
  const source = (s.source ?? "").toLowerCase();
  const medium = (s.medium ?? "").toLowerCase();
  const attribution = (s.attributionSource ?? "").toLowerCase();
  if (PAID_MEDIA.has(medium)) return false;
  if (medium === "organic") return true;
  if (SEARCH_ENGINES.has(source) && !medium) return true;
  return attribution === "organic" || attribution === "organic_search" || attribution === "seo";
}
function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}
function normalizePath(value: string): string {
  try { return new URL(value, "https://shalean.co.za").pathname.replace(/\/+$/, "") || "/"; } catch { return value || "/"; }
}

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const since = new Date();
  since.setDate(since.getDate() - 90);
  const sinceIso = since.toISOString();

  const [{ data: events, error: eventError }, { data: keywords, error: keywordError }, { data: gsc }] = await Promise.all([
    admin.from("user_events").select("event_type,created_at,payload").gte("created_at", sinceIso).order("created_at", { ascending: true }).limit(100000),
    admin.from("seo_tracked_keywords").select("keyword,target_path,priority,intent,active").eq("active", true),
    admin.from("site_gsc_metrics").select("page_url,clicks,impressions,avg_position"),
  ]);
  if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 });
  if (keywordError) return NextResponse.json({ error: keywordError.message }, { status: 500 });

  const sessions = new Map<string, Session>();
  for (const row of (events ?? []) as EventRow[]) {
    const p = payload(row);
    const sid = sessionId(p);
    if (!sid) continue;
    const existing = sessions.get(sid) ?? {
      id: sid,
      landing: resolveSessionLanding(null, p),
      source: text(p.utm_source),
      medium: text(p.utm_medium),
      attributionSource: text(p.attribution_source),
      started: false,
      completed: false,
      bookingId: null,
    };
    existing.landing = resolveSessionLanding(existing.landing, p, row.event_type);
    existing.source ??= text(p.utm_source);
    existing.medium ??= text(p.utm_medium);
    existing.attributionSource ??= text(p.attribution_source);
    existing.bookingId ??= bookingId(p);
    if (isStartEvent(row.event_type)) existing.started = true;
    if (isCompleteEvent(row.event_type)) existing.completed = true;
    sessions.set(sid, existing);
  }

  const organic = [...sessions.values()].filter(isOrganic);
  const bookingIds = [...new Set(organic.filter(s => s.completed && s.bookingId).map(s => s.bookingId!))];
  const bookingRevenue = new Map<string, number>();
  if (bookingIds.length) {
    const { data: bookings, error } = await admin.from("bookings").select("id,total_amount,amount_paid,status,payment_status").in("id", bookingIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const row of bookings ?? []) {
      const amount = Number(row.amount_paid ?? row.total_amount ?? 0);
      if (Number.isFinite(amount) && amount > 0) bookingRevenue.set(row.id, amount);
    }
  }

  const gscByPath = new Map<string, { clicks:number; impressions:number; position:number|null }>();
  for (const row of gsc ?? []) {
    const path = normalizePath(row.page_url);
    gscByPath.set(path, { clicks: Number(row.clicks ?? 0), impressions: Number(row.impressions ?? 0), position: typeof row.avg_position === "number" ? row.avg_position : null });
  }
  const keywordsByPath = new Map<string, string[]>();
  for (const row of keywords ?? []) {
    if (!row.target_path) continue;
    const path = normalizePath(row.target_path);
    const list = keywordsByPath.get(path) ?? [];
    list.push(row.keyword);
    keywordsByPath.set(path, list);
  }

  type Bucket = { sessions:Set<string>; starts:Set<string>; completed:Set<string>; revenue:number };
  const buckets = new Map<string, Bucket>();
  function bucket(path: string): Bucket {
    const normalized = normalizePath(path);
    let b = buckets.get(normalized);
    if (!b) { b = { sessions:new Set(), starts:new Set(), completed:new Set(), revenue:0 }; buckets.set(normalized, b); }
    return b;
  }
  for (const s of organic) {
    const b = bucket(s.landing);
    b.sessions.add(s.id);
    if (s.started) b.starts.add(s.id);
    if (s.completed) {
      b.completed.add(s.id);
      if (s.bookingId) b.revenue += bookingRevenue.get(s.bookingId) ?? 0;
    }
  }

  const byLanding = [...buckets.entries()].map(([path, b]) => {
    const gscRow = gscByPath.get(path);
    return {
      path,
      sessions: b.sessions.size,
      booking_starts: b.starts.size,
      completed_bookings: b.completed.size,
      session_to_booking_pct: pct(b.completed.size, b.sessions.size),
      start_to_booking_pct: pct(b.completed.size, b.starts.size),
      revenue_zar: Math.round(b.revenue * 100) / 100,
      revenue_per_session_zar: b.sessions.size ? Math.round((b.revenue / b.sessions.size) * 100) / 100 : 0,
      target_keywords: keywordsByPath.get(path) ?? [],
      gsc_clicks: gscRow?.clicks ?? 0,
      gsc_impressions: gscRow?.impressions ?? 0,
      gsc_position: gscRow?.position ?? null,
    };
  }).sort((a,b) => b.revenue_zar - a.revenue_zar || b.completed_bookings - a.completed_bookings || b.sessions - a.sessions);

  const clusterRows = [...keywordsByPath.entries()].map(([path, targetKeywords]) => {
    const landing = byLanding.find(r => r.path === path);
    return {
      path,
      keywords: targetKeywords,
      sessions: landing?.sessions ?? 0,
      booking_starts: landing?.booking_starts ?? 0,
      completed_bookings: landing?.completed_bookings ?? 0,
      conversion_pct: landing?.session_to_booking_pct ?? 0,
      revenue_zar: landing?.revenue_zar ?? 0,
      gsc_clicks: landing?.gsc_clicks ?? gscByPath.get(path)?.clicks ?? 0,
      gsc_impressions: landing?.gsc_impressions ?? gscByPath.get(path)?.impressions ?? 0,
      gsc_position: landing?.gsc_position ?? gscByPath.get(path)?.position ?? null,
    };
  }).sort((a,b) => b.revenue_zar - a.revenue_zar || b.gsc_clicks - a.gsc_clicks);

  const totalRevenue = byLanding.reduce((sum, row) => sum + row.revenue_zar, 0);
  const totalCompleted = organic.filter(s => s.completed).length;
  const totalStarted = organic.filter(s => s.started).length;
  const unattributedSessions = [...sessions.values()].filter(s => !s.source && !s.medium && !s.attributionSource).length;

  return NextResponse.json({
    since: sinceIso,
    attribution_note: "Organic includes explicit organic/SEO attribution or recognized search-engine source without paid medium. No-UTM sessions are kept unattributed and are not counted as organic.",
    summary: {
      organic_sessions: organic.length,
      organic_booking_starts: totalStarted,
      organic_completed_bookings: totalCompleted,
      organic_conversion_pct: pct(totalCompleted, organic.length),
      organic_revenue_zar: Math.round(totalRevenue * 100) / 100,
      revenue_per_organic_session_zar: organic.length ? Math.round((totalRevenue / organic.length) * 100) / 100 : 0,
      unattributed_sessions: unattributedSessions,
      revenue_linked_bookings: bookingRevenue.size,
    },
    byLanding,
    keywordClusters: clusterRows,
  });
}
