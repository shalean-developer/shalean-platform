import { NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import {
  autoResolveNotificationAlertsIfRecovered,
  computeNotificationDerived,
  evaluateNotificationAlertsAndFire,
  fetchLastNotificationFailureTimes,
} from "@/lib/admin/notificationMonitoring";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read-only counts by `system_logs.source` for notification / delivery observability.
 * Query: `days` (1–90, default 7), optional `alerts=1` to run threshold checks (or set NOTIFICATION_METRICS_ALERTS=true).
 */
export async function GET(req: Request) {
  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(req.url);
  const daysParam = Number(url.searchParams.get("days") ?? "7");
  const days = Number.isFinite(daysParam) ? Math.min(90, Math.max(1, Math.round(daysParam))) : 7;

  const { data, error } = await admin.rpc("notification_system_logs_summary", { p_days: days });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const bySource = (data != null && typeof data === "object" ? data : {}) as Record<string, unknown>;
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
  const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();
  const lastFailures = await fetchLastNotificationFailureTimes(admin, sinceIso);

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

  const thresholds = { minSample, waAlertPct, emailErrAlertPct, slowAlertMin };
  let alertsAutoResolved = 0;
  if (alertsEnabled) {
    const ids = await autoResolveNotificationAlertsIfRecovered({
      admin,
      derived,
      alertsEnabled,
      thresholds,
    });
    alertsAutoResolved = ids.length;
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

  return NextResponse.json({
    days,
    bySource,
    derived,
    lastWhatsappFailureAt: lastFailures.lastWhatsappFailureAt,
    lastEmailFailureAt: lastFailures.lastEmailFailureAt,
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
    note: "Latency: context.eventTriggeredAtIso vs row created_at. slow_notification when pipelineLatencyMs > 5000.",
  });
}
