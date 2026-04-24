import { NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import {
  autoResolveNotificationAlertsIfRecovered,
  computeNotificationDerived,
  computeNotificationHealth,
  evaluateNotificationAlertsAndFire,
  fetchLastNotificationFailureTimes,
  computeFlapRatePerHour,
  getFlapSeverity,
  incidentDurationMs,
  mapSystemLogRowToRecentNotificationEvent,
  NOTIFICATION_MONITORING_RECENT_SOURCES,
} from "@/lib/admin/notificationMonitoring";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DailyRow = { day: string; source: string; cnt: number };

function parseDailyRpc(raw: unknown): DailyRow[] {
  if (!Array.isArray(raw)) return [];
  const out: DailyRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const day = typeof o.day === "string" ? o.day : "";
    const source = typeof o.source === "string" ? o.source : "";
    const cnt =
      typeof o.cnt === "number" && Number.isFinite(o.cnt)
        ? o.cnt
        : typeof o.cnt === "string"
          ? Number(o.cnt)
          : 0;
    if (day && source && Number.isFinite(cnt)) out.push({ day, source, cnt });
  }
  return out;
}

/**
 * Bundle for the admin notification monitoring page: summary RPC, 7d buckets, last failures, recent rows.
 * Query: `days` (1–90), `alerts=1` or NOTIFICATION_METRICS_ALERTS to run auto-resolve, threshold checks, and firing.
 */
export async function GET(req: Request) {
  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(req.url);
  const daysParam = Number(url.searchParams.get("days") ?? "7");
  const days = Number.isFinite(daysParam) ? Math.min(90, Math.max(1, Math.round(daysParam))) : 7;
  const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();

  const [summaryRes, dailyRes, lastFailures, recentRes] = await Promise.all([
    admin.rpc("notification_system_logs_summary", { p_days: days }),
    admin.rpc("notification_system_logs_daily", { p_days: days }),
    fetchLastNotificationFailureTimes(admin, sinceIso),
    admin
      .from("system_logs")
      .select("id, created_at, source, message, context")
      .in("source", [...NOTIFICATION_MONITORING_RECENT_SOURCES])
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(80),
  ]);

  if (summaryRes.error) {
    return NextResponse.json({ error: summaryRes.error.message }, { status: 500 });
  }

  const bySource = (summaryRes.data != null && typeof summaryRes.data === "object"
    ? summaryRes.data
    : {}) as Record<string, unknown>;
  const n = (k: string) => {
    const v = bySource[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const p = Number(v);
      return Number.isFinite(p) ? p : 0;
    }
    return 0;
  };
  const derived = computeNotificationDerived(n);

  let daily: DailyRow[] = [];
  if (!dailyRes.error && dailyRes.data != null) {
    daily = parseDailyRpc(dailyRes.data);
  }

  const recentRows = (recentRes.data ?? []) as Array<{
    id: string;
    created_at: string;
    source: string;
    message: string;
    context: Record<string, unknown> | null;
  }>;
  const recent = recentRows.map(mapSystemLogRowToRecentNotificationEvent);

  const alertsEnabled =
    process.env.NOTIFICATION_METRICS_ALERTS === "true" || url.searchParams.get("alerts") === "1";
  const minSampleRaw = Number(process.env.NOTIFICATION_METRICS_MIN_SAMPLE ?? "20");
  const minSample = Number.isFinite(minSampleRaw) ? Math.min(500, Math.max(1, Math.round(minSampleRaw))) : 20;
  const waAlertPctRaw = Number(process.env.NOTIFICATION_WHATSAPP_SUCCESS_ALERT_PCT ?? "90");
  const waAlertPct = Number.isFinite(waAlertPctRaw) ? Math.min(100, Math.max(0, Math.round(waAlertPctRaw))) : 90;
  const emailErrAlertPctRaw = Number(process.env.NOTIFICATION_EMAIL_ERROR_ALERT_PCT ?? "10");
  const emailErrAlertPct = Number.isFinite(emailErrAlertPctRaw)
    ? Math.min(100, Math.max(0, Math.round(emailErrAlertPctRaw)))
    : 10;
  const slowAlertMinRaw = Number(process.env.NOTIFICATION_SLOW_ALERT_MIN ?? "5");
  const slowAlertMin = Number.isFinite(slowAlertMinRaw) ? Math.min(500, Math.max(1, Math.round(slowAlertMinRaw))) : 5;
  const cooldownRaw = Number(process.env.NOTIFICATION_ALERT_COOLDOWN_MINUTES ?? "10");
  const cooldownMinutes = Number.isFinite(cooldownRaw) ? Math.min(240, Math.max(1, Math.round(cooldownRaw))) : 10;

  const thresholds = { minSample, waAlertPct, emailErrAlertPct: emailErrAlertPct, slowAlertMin };

  const health = computeNotificationHealth({
    derived,
    minSample,
    waAlertPct,
    emailErrAlertPct,
    slowAlertMin,
  });

  let alertsAutoResolved = 0;
  if (alertsEnabled) {
    const resolvedIds = await autoResolveNotificationAlertsIfRecovered({
      admin,
      derived,
      alertsEnabled,
      thresholds,
    });
    alertsAutoResolved = resolvedIds.length;
  }

  const alertsFired = await evaluateNotificationAlertsAndFire({
    admin,
    days,
    derived,
    alertsEnabled,
    minSample,
    waAlertPct,
    emailErrAlertPct,
    slowAlertMin,
    cooldownMinutes,
  });

  const alertHistoryRes = await admin
    .from("notification_alerts")
    .select("id, type, severity, fired_at, first_fired_at, resolved_at, context, occurrence_count, is_flapping, flap_count")
    .order("fired_at", { ascending: false })
    .limit(200);

  const now = Date.now();
  const alertHistoryRows = (alertHistoryRes.data ?? []) as Array<{
    id: string;
    type: string;
    severity: string;
    fired_at: string;
    first_fired_at?: string | null;
    resolved_at: string | null;
    context: Record<string, unknown> | null;
    occurrence_count?: number | null;
    is_flapping?: boolean | null;
    flap_count?: number | null;
  }>;

  const alertHistoryMapped = alertHistoryRows.map((r) => {
    const occ = r.occurrence_count;
    const occurrenceCount = typeof occ === "number" && Number.isFinite(occ) && occ > 0 ? occ : 1;
    const started =
      typeof r.first_fired_at === "string" && r.first_fired_at.trim() ? r.first_fired_at.trim() : r.fired_at;
    const flapRaw = r.flap_count;
    const flapCount =
      typeof flapRaw === "number" && Number.isFinite(flapRaw) && flapRaw >= 0 ? flapRaw : 0;
    const durationMs = incidentDurationMs(started, r.resolved_at, now);
    return {
      id: r.id,
      type: r.type,
      severity: r.severity,
      firstFiredAt: started,
      firedAt: r.fired_at,
      resolvedAt: r.resolved_at,
      context: r.context ?? {},
      occurrenceCount,
      isFlapping: Boolean(r.is_flapping),
      flapCount,
      flapSeverity: getFlapSeverity(flapCount),
      flapRatePerHour: computeFlapRatePerHour(flapCount, durationMs),
      durationMs,
    };
  });
  alertHistoryMapped.sort((a, b) => {
    const fp = (x: (typeof alertHistoryMapped)[0]) => (x.isFlapping ? 1 : 0);
    if (fp(b) !== fp(a)) return fp(b) - fp(a);
    if (b.durationMs !== a.durationMs) return b.durationMs - a.durationMs;
    return new Date(b.firedAt).getTime() - new Date(a.firedAt).getTime();
  });
  const alertHistory = alertHistoryMapped.slice(0, 50);

  return NextResponse.json({
    days,
    bySource,
    derived,
    health,
    lastWhatsappFailureAt: lastFailures.lastWhatsappFailureAt,
    lastEmailFailureAt: lastFailures.lastEmailFailureAt,
    daily,
    dailyError: dailyRes.error?.message ?? null,
    recent,
    recentError: recentRes.error?.message ?? null,
    alertHistory: alertHistoryRes.error ? [] : alertHistory,
    alertHistoryError: alertHistoryRes.error?.message ?? null,
    alerts: {
      checked: alertsEnabled,
      fired: alertsFired,
      autoResolved: alertsAutoResolved,
      minSample,
      whatsappSuccessAlertBelowPct: waAlertPct,
      emailErrorAlertAbovePct: emailErrAlertPct,
      slowAlertMinCount: slowAlertMin,
      cooldownMinutes,
    },
  });
}
