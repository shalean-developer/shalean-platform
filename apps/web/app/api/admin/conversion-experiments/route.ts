import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import {
  CONVERSION_ROLLOUT_MIN_CONV_DIFF,
  CONVERSION_ROLLOUT_MIN_PER_ARM,
  CONVERSION_ROLLOUT_MIN_REVENUE_RATIO,
  CONVERSION_ROLLOUT_MIN_TOTAL_EXPOSURES,
  fetchPaymentDeliveryStatsForAdmin,
  learnConversionExperimentPerformance,
  maybeApplyConversionExperimentAutoRollout,
  suggestConversionRolloutAdjustments,
} from "@/lib/conversion/conversionExperimentAnalytics";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin: conversion experiment performance, variant comparison, channel aggregates; optional safe auto-rollout.
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
  const defaultSince = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const sinceIso = searchParams.get("since")?.trim() || defaultSince;
  const experimentKey = searchParams.get("experiment_key")?.trim() || undefined;
  const auto = searchParams.get("auto") === "1";

  const experiments = await learnConversionExperimentPerformance(admin, { sinceIso, experimentKey });
  const rollout_suggestions = suggestConversionRolloutAdjustments(experiments);
  const payment_delivery_stats = await fetchPaymentDeliveryStatsForAdmin(admin);

  let auto_rollout: { applied: boolean; updates: string[] } | undefined;
  if (auto) {
    auto_rollout = await maybeApplyConversionExperimentAutoRollout(admin);
    if (auto_rollout.applied) {
      const refreshed = await learnConversionExperimentPerformance(admin, { sinceIso, experimentKey });
      return NextResponse.json({
        since: sinceIso,
        experiments: refreshed,
        rollout_suggestions,
        payment_delivery_stats,
        auto_rollout,
        rollout_guards: {
          min_total_exposures: CONVERSION_ROLLOUT_MIN_TOTAL_EXPOSURES,
          min_per_arm: CONVERSION_ROLLOUT_MIN_PER_ARM,
          min_conversion_lead: CONVERSION_ROLLOUT_MIN_CONV_DIFF,
          min_revenue_score_ratio: CONVERSION_ROLLOUT_MIN_REVENUE_RATIO,
        },
      });
    }
  }

  return NextResponse.json({
    since: sinceIso,
    experiments,
    rollout_suggestions,
    payment_delivery_stats,
    rollout_guards: {
      min_total_exposures: CONVERSION_ROLLOUT_MIN_TOTAL_EXPOSURES,
      min_per_arm: CONVERSION_ROLLOUT_MIN_PER_ARM,
      min_conversion_lead: CONVERSION_ROLLOUT_MIN_CONV_DIFF,
      min_revenue_score_ratio: CONVERSION_ROLLOUT_MIN_REVENUE_RATIO,
    },
    ...(auto_rollout ? { auto_rollout } : {}),
  });
}
