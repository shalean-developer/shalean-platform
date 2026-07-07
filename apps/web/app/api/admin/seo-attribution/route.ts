import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";
import {
  DIRECT_BOOKING_FLOW_LANDING,
  resolveSessionLanding,
} from "@/lib/admin/landingPageAttribution";
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
  return resolveSessionLanding(null, payload);
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

type Bucket = { sessions: Set<string>; quoted: Set<string>; completed: Set<string> };
type SourceBucket = Bucket & { source: string; medium: string };

function ensureBucket(map: Map<string, Bucket>, key: string): Bucket {
  let b = map.get(key);
  if (!b) {
    b = { sessions: new Set(), quoted: new Set(), completed: new Set() };
    map.set(key, b);
  }
  return b;
}

function ensureSourceBucket(
  map: Map<string, SourceBucket>,
  key: string,
  source: string,
  medium: string,
): SourceBucket {
  let b = map.get(key);
  if (!b) {
    b = { sessions: new Set(), quoted: new Set(), completed: new Set(), source, medium };
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
    ANALYTICS_EVENTS.START_BOOKING,
    ANALYTICS_EVENTS.BOOKING_SERVICE_SELECTED,
    ANALYTICS_EVENTS.COMPLETE_BOOKING,
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
        byDay: [],
        bySource: [],
        byService: [],
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as UserEventRow[];

  const landingBuckets = new Map<string, Bucket>();
  const sourceBuckets = new Map<string, SourceBucket>();
  const serviceBuckets = new Map<string, Bucket>();

  let sessionsWithUtm = 0;
  let sessionsWithLandingCapture = 0;

  const allQuoted = new Set<string>();
  const allCompleted = new Set<string>();

  function isQuoteEvent(et: string | null | undefined): boolean {
    return et === ANALYTICS_EVENTS.START_BOOKING || et === ANALYTICS_EVENTS.BOOKING_SERVICE_SELECTED;
  }

  function isCompleteEvent(et: string | null | undefined): boolean {
    return et === ANALYTICS_EVENTS.BOOKING_COMPLETED || et === ANALYTICS_EVENTS.COMPLETE_BOOKING;
  }

  type SessionEvents = {
    landing: string;
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
    gbp_attribution: string | null;
    hadPageView: boolean;
    hadQuote: boolean;
    hadComplete: boolean;
    service_type: string | null;
    quoteDay: string | null;
    completeDay: string | null;
  };

  const sessions = new Map<string, SessionEvents>();

  for (const row of rows) {
    const payload = safePayload(row);
    const sid = correlationSessionId(payload);
    if (!sid) continue;

    let session = sessions.get(sid);
    if (!session) {
      session = {
        landing: landingKey(payload),
        utm_source: stringValue(payload.utm_source),
        utm_medium: stringValue(payload.utm_medium),
        utm_campaign: stringValue(payload.utm_campaign),
        gbp_attribution: stringValue(payload.gbp_attribution),
        hadPageView: false,
        hadQuote: false,
        hadComplete: false,
        service_type: null,
        quoteDay: null,
        completeDay: null,
      };
      sessions.set(sid, session);
    } else {
      session.landing = resolveSessionLanding(session.landing, payload, row.event_type);
      session.utm_source ??= stringValue(payload.utm_source);
      session.utm_medium ??= stringValue(payload.utm_medium);
      session.utm_campaign ??= stringValue(payload.utm_campaign);
      session.gbp_attribution ??= stringValue(payload.gbp_attribution);
    }

    const et = row.event_type;
    const eventDay = typeof row.created_at === "string" ? row.created_at.slice(0, 10) : null;
    if (et === ANALYTICS_EVENTS.PAGE_VIEW) session.hadPageView = true;
    if (isQuoteEvent(et)) {
      session.hadQuote = true;
      if (!session.quoteDay && eventDay) session.quoteDay = eventDay;
      session.service_type = stringValue(payload.service_type) ?? session.service_type;
    }
    if (isCompleteEvent(et)) {
      session.hadComplete = true;
      if (!session.completeDay && eventDay) session.completeDay = eventDay;
      session.service_type = stringValue(payload.service_type) ?? session.service_type;
    }
  }

  for (const [sid, session] of sessions) {
    if (session.utm_source || session.utm_medium) sessionsWithUtm += 1;
    if (session.landing !== DIRECT_BOOKING_FLOW_LANDING) sessionsWithLandingCapture += 1;

    const hasAttributionSignal = Boolean(session.utm_source || session.utm_medium || session.gbp_attribution);
    const sourceKey = hasAttributionSignal
      ? `${session.utm_source ?? (session.gbp_attribution ? `gbp:${session.gbp_attribution}` : "—")}|${session.utm_medium ?? "—"}`
      : "(organic / no UTM)";

    // Count every attributed session — quote-only sessions were previously omitted when page_view was missing.
    ensureBucket(landingBuckets, session.landing).sessions.add(sid);

    const srcLabel = hasAttributionSignal
      ? session.utm_source ?? (session.gbp_attribution ? `gbp:${session.gbp_attribution}` : "—")
      : "(organic / no UTM)";
    const medLabel = hasAttributionSignal ? session.utm_medium ?? "—" : "—";

    if (session.hadQuote) {
      allQuoted.add(sid);
      ensureBucket(landingBuckets, session.landing).quoted.add(sid);
      ensureSourceBucket(sourceBuckets, sourceKey, srcLabel, medLabel).quoted.add(sid);
      const svc = session.service_type ?? "Unknown";
      ensureBucket(serviceBuckets, svc).quoted.add(sid);
    }

    if (session.hadComplete) {
      allCompleted.add(sid);
      ensureBucket(landingBuckets, session.landing).completed.add(sid);
      ensureSourceBucket(sourceBuckets, sourceKey, srcLabel, medLabel).completed.add(sid);
      const svc = session.service_type ?? "Unknown";
      ensureBucket(serviceBuckets, svc).completed.add(sid);
    }
  }

  const quotedCount = allQuoted.size;
  const completedCount = [...allCompleted].filter((s) => allQuoted.has(s)).length;

  const byLanding = [...landingBuckets.entries()]
    .map(([landing, b]) => ({
      landing,
      sessions: b.sessions.size,
      quoted: b.quoted.size,
      completed: [...b.completed].filter((s) => b.quoted.has(s)).length,
      conversionPct: pct([...b.completed].filter((s) => b.quoted.has(s)).length, b.quoted.size),
    }))
    .filter((r) => r.sessions > 0 || r.quoted > 0)
    .sort((a, b) => {
      if (a.landing === DIRECT_BOOKING_FLOW_LANDING) return 1;
      if (b.landing === DIRECT_BOOKING_FLOW_LANDING) return -1;
      return b.quoted - a.quoted || b.sessions - a.sessions;
    });

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

  // Per-day analytics-session series so the daily chart reconciles with the KPI cards.
  const dayMap = new Map<string, { date: string; starts: number; completed: number }>();
  const cursor = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate()));
  const today = new Date();
  const endDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  while (cursor <= endDay) {
    const key = cursor.toISOString().slice(0, 10);
    dayMap.set(key, { date: key, starts: 0, completed: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  for (const session of sessions.values()) {
    if (session.hadQuote && session.quoteDay) {
      const bucket = dayMap.get(session.quoteDay);
      if (bucket) bucket.starts += 1;
    }
    if (session.hadQuote && session.hadComplete && session.completeDay) {
      const bucket = dayMap.get(session.completeDay);
      if (bucket) bucket.completed += 1;
    }
  }

  const byDay = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    since: sinceIso,
    rowsLoaded: rows.length,
    summary: {
      distinctSessionsQuoted: quotedCount,
      distinctSessionsCompleted: completedCount,
      overallConversionPct: pct(completedCount, quotedCount),
      sessionsTracked: sessions.size,
      sessionsWithUtm,
      sessionsWithLandingCapture,
    },
    byLanding,
    byDay,
    bySource,
    byService,
  });
}
