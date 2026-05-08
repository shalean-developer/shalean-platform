import { NextResponse } from "next/server";
import { runAnalyticsOperationalAlerts } from "@/lib/analytics/analyticsOperationalAlerts";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vercel Cron: `Authorization: Bearer CRON_SECRET`.
 * Suggested schedule: daily ~02:30 UTC — refresh analytics MVs, populate `daily_*` rollups, optional Slack on sharp drops.
 *
 * DB migration: `20260931_analytics_warehouse_refresh.sql` (`run_analytics_warehouse_nightly`).
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

  try {
    const { error: rpcErr } = await admin.rpc("run_analytics_warehouse_nightly");
    if (rpcErr) {
      throw new Error(rpcErr.message);
    }

    const slackUrl = process.env.ANALYTICS_SLACK_WEBHOOK_URL?.trim();
    const alertsDisabled = process.env.ANALYTICS_BOOKING_DROP_ALERTS_DISABLED === "1";

    const operationalAlerts = await runAnalyticsOperationalAlerts({
      admin,
      slackWebhookUrl: slackUrl || undefined,
      disabled: alertsDisabled,
    });

    const alerted =
      (!("skipped" in operationalAlerts.bookingCompletionDrop) &&
        operationalAlerts.bookingCompletionDrop.alerted) ||
      (operationalAlerts.scheduleFetchSpike?.alerted ?? false);

    await logSystemEvent({
      level: alerted ? "warn" : "info",
      source: "cron/analytics-warehouse",
      message: alerted ? "Analytics operational Slack alert(s) sent" : "Analytics warehouse nightly OK",
      context: { operationalAlerts },
    });

    return NextResponse.json({ ok: true, operationalAlerts });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logSystemEvent({
      level: "error",
      source: "cron/analytics-warehouse",
      message: msg,
      context: {},
    });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
