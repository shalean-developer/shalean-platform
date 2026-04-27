import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import {
  buildConversionDashboardAlerts,
  fetchConversionTrendPack,
  fetchFunnelSegmentBreakdown,
  fetchWeekOverWeekFunnelSnapshot,
} from "@/lib/conversion/conversionDashboardAdvanced";
import { fetchPaymentConversionFunnel } from "@/lib/conversion/conversionDashboardStats";
import {
  CONVERSION_ROLLOUT_MIN_CONV_DIFF,
  CONVERSION_ROLLOUT_MIN_PER_ARM,
  CONVERSION_ROLLOUT_MIN_REVENUE_RATIO,
  CONVERSION_ROLLOUT_MIN_TOTAL_EXPOSURES,
  fetchPaymentDeliveryStatsForAdmin,
  suggestConversionRolloutAdjustments,
} from "@/lib/conversion/conversionExperimentAnalytics";
import { learnGrowthEffectiveness } from "@/lib/growth/growthActionOutcomes";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  buildWhatsappReliabilityAlerts,
  fetchWhatsappDashboardMetrics,
  fetchWhatsappDashboardMetricsPriorWindow,
} from "@/lib/whatsapp/whatsappReliabilityMetrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin: Phase 7 dashboard payload — payment funnel, channel health, experiments, growth sends.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const pub = createClient(url, anon);
  const { data: userData } = await pub.auth.getUser(token);
  if (!userData.user?.email || !isAdmin(userData.user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const defaultSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sinceIso = searchParams.get("since")?.trim() || defaultSince;

  const [payment_funnel, payment_delivery_stats, growthBundle, trends, segments, week_over_week, whatsapp_current, whatsapp_prior] =
    await Promise.all([
      fetchPaymentConversionFunnel(admin, sinceIso),
      fetchPaymentDeliveryStatsForAdmin(admin),
      learnGrowthEffectiveness(admin, { sinceIso }),
      fetchConversionTrendPack(admin, { daysBack: 30 }),
      fetchFunnelSegmentBreakdown(admin, sinceIso),
      fetchWeekOverWeekFunnelSnapshot(admin),
      fetchWhatsappDashboardMetrics(admin, sinceIso),
      fetchWhatsappDashboardMetricsPriorWindow(admin, sinceIso),
    ]);

  const experiments = growthBundle.conversion_experiments;
  const rollout_suggestions = suggestConversionRolloutAdjustments(experiments);
  const alerts = [
    ...buildConversionDashboardAlerts({
      payment_delivery_stats,
      payment_funnel,
      week_over_week,
    }),
    ...buildWhatsappReliabilityAlerts({
      current: whatsapp_current,
      prior: whatsapp_prior,
    }),
  ];

  const whatsapp_metrics = {
    delivery_rate: whatsapp_current.channel.delivery_rate,
    read_rate: whatsapp_current.channel.read_rate,
    reply_rate: whatsapp_current.dispatch.reply_rate,
    accept_rate: whatsapp_current.dispatch.accept_rate,
    read_receipt_rate: whatsapp_current.dispatch.read_receipt_rate,
    sample_sizes: {
      outbound_messages_sent: whatsapp_current.channel.messages_sent,
      outbound_messages_delivered: whatsapp_current.channel.messages_delivered,
      outbound_messages_read: whatsapp_current.channel.messages_read,
      dispatch_offers_whatsapp: whatsapp_current.dispatch.offers_whatsapp_sent,
    },
    channel: whatsapp_current.channel,
    dispatch: whatsapp_current.dispatch,
    cleaner_responsiveness_sample: whatsapp_current.cleaner_responsiveness_sample,
  };

  return NextResponse.json({
    since: sinceIso,
    payment_funnel,
    payment_delivery_stats,
    experiments,
    rollout_suggestions,
    rollout_guards: {
      min_total_exposures: CONVERSION_ROLLOUT_MIN_TOTAL_EXPOSURES,
      min_per_arm: CONVERSION_ROLLOUT_MIN_PER_ARM,
      min_conversion_lead: CONVERSION_ROLLOUT_MIN_CONV_DIFF,
      min_revenue_score_ratio: CONVERSION_ROLLOUT_MIN_REVENUE_RATIO,
    },
    growth_rows: growthBundle.growth_rows,
    trends,
    trends_meta: {
      funnel_note:
        "Daily funnel counts attribute paid to the same calendar day as first link send (approximation for volume trend).",
      email_note: "Daily email rows from payment_link_delivery_events.",
    },
    week_over_week,
    segments,
    alerts,
    whatsapp_metrics,
  });
}
