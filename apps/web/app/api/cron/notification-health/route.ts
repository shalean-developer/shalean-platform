import { NextResponse } from "next/server";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { runNotificationHealthCheck } from "@/lib/notifications/notificationHealthMonitor";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_WINDOW_HOURS = 2;

/**
 * Vercel Cron: `Authorization: Bearer CRON_SECRET`.
 * Suggested: every 10 minutes — POST /api/cron/notification-health
 *
 * Evaluates recent `notification_logs` and emails admins when WhatsApp success rate, SMS failures,
 * or email failures cross thresholds (deduped via `system_logs` source `notification_health_alert`).
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const hoursRaw = Number(process.env.NOTIFICATION_HEALTH_WINDOW_HOURS ?? DEFAULT_WINDOW_HOURS);
  const hours =
    Number.isFinite(hoursRaw) && hoursRaw > 0 ? Math.min(48, Math.max(0.25, hoursRaw)) : DEFAULT_WINDOW_HOURS;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  try {
    const { window, alerts } = await runNotificationHealthCheck({ admin, sinceIso: since });
    await logSystemEvent({
      level: "info",
      source: "cron/notification-health",
      message: alerts.length ? `Alerts: ${alerts.join(", ")}` : "No threshold breaches",
      context: { window, alerts },
    });
    return NextResponse.json({ ok: true, alerts, window });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
