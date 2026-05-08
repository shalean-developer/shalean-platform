import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";
import { isAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UserEventRow = {
  event_type?: string | null;
  created_at?: string | null;
  payload?: Record<string, unknown> | null;
};

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safePayload(row: UserEventRow): Record<string, unknown> {
  return row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {};
}

function correlationSessionId(payload: Record<string, unknown>): string | null {
  return (
    stringValue(payload.analytics_session_id) ??
    stringValue(payload.session_id) ??
    stringValue(payload.booking_session_id)
  );
}

function landingKey(payload: Record<string, unknown>): string {
  const slug = stringValue(payload.landing_page_slug);
  if (slug) return slug.slice(0, 240);
  const ft = payload.acquisition_first_touch;
  if (ft && typeof ft === "object" && !Array.isArray(ft)) {
    const lp = (ft as Record<string, unknown>).landing_pathname;
    if (typeof lp === "string" && lp.trim()) return lp.trim().slice(0, 240);
  }
  const path = stringValue(payload.pathname);
  if (path) return path.slice(0, 240);
  return "(no landing captured)";
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

type Bucket = { quoted: Set<string>; completed: Set<string> };

function ensureBucket(map: Map<string, Bucket>, key: string): Bucket {
  let b = map.get(key);
  if (!b) {
    b = { quoted: new Set(), completed: new Set() };
    map.set(key, b);
  }
  return b;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const pub = createClient(url, anon);
  const {
    data: { user },
    error: userErr,
  } = await pub.auth.getUser(token);
  if (userErr || !user?.email) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }
  if (!isAdmin(user.email)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceIso = since.toISOString();

  const eventTypes = [
    ANALYTICS_EVENTS.PAGE_VIEW,
    ANALYTICS_EVENTS.BOOKING_SERVICE_SELECTED,
    ANALYTICS_EVENTS.BOOKING_COMPLETED,
  ];

  const { data, error } = await admin
    .from("user_events")
    .select("event_type, created_at, payload")
    .in("event_type", eventTypes)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true })
    .limit(100_000);

  if (error) {
    if (error.message.includes("does not exist") || error.code === "42P01") {
      return NextResponse.json({
        since: sinceIso,
        rowsLoaded: 0,
        message: "`user_events` missing — run analytics migrations.",
        summary: null,
        byLanding: [],
        bySource: [],
        byService: [],
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as UserEventRow[];

  type SessionMeta = {
    landing: string;
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
    gbp_attribution: string | null;
  };

  const sessionMeta = new Map<string, SessionMeta>();
  const landingBuckets = new Map<string, Bucket>();
  const sourceBuckets = new Map<string, Bucket & { source: string; medium: string }>();
  const serviceBuckets = new Map<string, Bucket>();

  let sessionsWithUtm = 0;
  let sessionsWithLandingCapture = 0;

  const allQuoted = new Set<string>();
  const allCompleted = new Set<string>();

  for (const row of rows) {
    const payload = safePayload(row);
    const sid = correlationSessionId(payload);
    if (!sid) continue;

    if (!sessionMeta.has(sid)) {
      const landing = landingKey(payload);
      const utm_source = stringValue(payload.utm_source);
      const utm_medium = stringValue(payload.utm_medium);
      const utm_campaign = stringValue(payload.utm_campaign);
      const gbp_attribution = stringValue(payload.gbp_attribution);
      sessionMeta.set(sid, {
        landing,
        utm_source,
        utm_medium,
        utm_campaign,
        gbp_attribution,
      });
      if (utm_source || utm_medium) sessionsWithUtm += 1;
      if (landing !== "(no landing captured)") sessionsWithLandingCapture += 1;
    }

    const meta = sessionMeta.get(sid)!;
    const hasAttributionSignal = Boolean(meta.utm_source || meta.utm_medium || meta.gbp_attribution);
    const sourceKey = hasAttributionSignal
      ? `${meta.utm_source ?? (meta.gbp_attribution ? `gbp:${meta.gbp_attribution}` : "—")}|${meta.utm_medium ?? "—"}`
      : "(organic / no UTM)";

    const et = row.event_type;
    if (et === ANALYTICS_EVENTS.BOOKING_SERVICE_SELECTED) {
      allQuoted.add(sid);
      const lb = ensureBucket(landingBuckets, meta.landing);
      lb.quoted.add(sid);
      let sb = sourceBuckets.get(sourceKey);
      if (!sb) {
        const srcLabel = hasAttributionSignal
          ? meta.utm_source ?? (meta.gbp_attribution ? `gbp:${meta.gbp_attribution}` : "—")
          : "(organic / no UTM)";
        const medLabel = hasAttributionSignal ? meta.utm_medium ?? "—" : "—";
        sb = {
          quoted: new Set(),
          completed: new Set(),
          source: srcLabel,
          medium: medLabel,
        };
        sourceBuckets.set(sourceKey, sb);
      }
      sb.quoted.add(sid);
      const svc = stringValue(payload.service_type) ?? "Unknown";
      ensureBucket(serviceBuckets, svc).quoted.add(sid);
    }

    if (et === ANALYTICS_EVENTS.BOOKING_COMPLETED) {
      allCompleted.add(sid);
      const lb = ensureBucket(landingBuckets, meta.landing);
      lb.completed.add(sid);
      let sb = sourceBuckets.get(sourceKey);
      if (!sb) {
        const srcLabel = hasAttributionSignal
          ? meta.utm_source ?? (meta.gbp_attribution ? `gbp:${meta.gbp_attribution}` : "—")
          : "(organic / no UTM)";
        const medLabel = hasAttributionSignal ? meta.utm_medium ?? "—" : "—";
        sb = {
          quoted: new Set(),
          completed: new Set(),
          source: srcLabel,
          medium: medLabel,
        };
        sourceBuckets.set(sourceKey, sb);
      }
      sb.completed.add(sid);
      const svc = stringValue(payload.service_type) ?? "Unknown";
      ensureBucket(serviceBuckets, svc).completed.add(sid);
    }
  }

  const quotedCount = allQuoted.size;
  const completedCount = [...allCompleted].filter((s) => allQuoted.has(s)).length;

  const byLanding = [...landingBuckets.entries()]
    .map(([landing, b]) => ({
      landing,
      quoted: b.quoted.size,
      completed: [...b.completed].filter((s) => b.quoted.has(s)).length,
      conversionPct: pct([...b.completed].filter((s) => b.quoted.has(s)).length, b.quoted.size),
    }))
    .filter((r) => r.quoted > 0)
    .sort((a, b) => b.quoted - a.quoted)
    .slice(0, 25);

  const bySource = [...sourceBuckets.entries()]
    .map(([, b]) => ({
      source: b.source,
      medium: b.medium,
      key: `${b.source} / ${b.medium}`,
      quoted: b.quoted.size,
      completed: [...b.completed].filter((s) => b.quoted.has(s)).length,
      conversionPct: pct([...b.completed].filter((s) => b.quoted.has(s)).length, b.quoted.size),
    }))
    .filter((r) => r.quoted > 0)
    .sort((a, b) => b.quoted - a.quoted)
    .slice(0, 20);

  const byService = [...serviceBuckets.entries()]
    .map(([service, b]) => ({
      service,
      quoted: b.quoted.size,
      completed: [...b.completed].filter((s) => b.quoted.has(s)).length,
      conversionPct: pct([...b.completed].filter((s) => b.quoted.has(s)).length, b.quoted.size),
    }))
    .filter((r) => r.quoted > 0)
    .sort((a, b) => b.quoted - a.quoted)
    .slice(0, 15);

  return NextResponse.json({
    since: sinceIso,
    rowsLoaded: rows.length,
    summary: {
      distinctSessionsQuoted: quotedCount,
      distinctSessionsCompleted: completedCount,
      overallConversionPct: pct(completedCount, quotedCount),
      sessionsTracked: sessionMeta.size,
      sessionsWithUtm,
      sessionsWithLandingCapture,
    },
    byLanding,
    bySource,
    byService,
  });
}
