import { NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import { computeNotificationDerived, computeNotificationHealth } from "@/lib/admin/notificationMonitoring";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** CSV snapshot of notification metrics (rates, volumes, health) for the given window. Query: `days` (1–90). */
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

  const health = computeNotificationHealth({
    derived,
    minSample,
    waAlertPct,
    emailErrAlertPct,
    slowAlertMin,
  });

  const rows: Array<[string, string | number | null]> = [
    ["export_generated_at", new Date().toISOString()],
    ["window_days", days],
    ["health", health],
    ["whatsapp_success_rate_pct", derived.whatsappSuccessRate],
    ["whatsapp_error_rate_pct", derived.whatsappErrorRate],
    ["sms_fallback_rate_pct", derived.smsFallbackRate],
    ["email_success_rate_pct", derived.emailSuccessRate],
    ["email_error_rate_pct", derived.emailErrorRate],
    ["volume_whatsapp_attempts", derived.whatsappTotal],
    ["volume_sms_rows", derived.smsTotal],
    ["volume_email_attempts", derived.emailTotal],
    ["volume_slow_notification", derived.slowNotificationCount],
    ["threshold_min_sample", minSample],
    ["threshold_whatsapp_success_below_pct", waAlertPct],
    ["threshold_email_error_above_pct", emailErrAlertPct],
    ["threshold_slow_min_count", slowAlertMin],
  ];

  for (const key of Object.keys(bySource).sort()) {
    rows.push([`bySource_${key}`, n(key)]);
  }

  const lines = ["metric,value", ...rows.map(([k, v]) => `${csvEscape(k)},${csvEscape(v)}`)];
  const csv = lines.join("\n");
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="notification-metrics-${stamp}.csv"`,
    },
  });
}
