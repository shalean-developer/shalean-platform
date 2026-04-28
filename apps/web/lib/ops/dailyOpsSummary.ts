import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { tryClaimNotificationDedupe } from "@/lib/notifications/notificationDedupe";
import { computeReviewPromptConversionRate } from "@/lib/reviews/reviewFunnelMetrics";

function utcYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type DailyOpsSummaryResult = { ok: boolean; skipped?: boolean; context?: Record<string, unknown> };

/**
 * At most once per UTC day: aggregate bookings / reviews / failed_jobs into system_logs.
 */
export async function logDailyOpsSummaryIfNeeded(supabase: SupabaseClient): Promise<DailyOpsSummaryResult> {
  const dayKey = utcYmd(new Date());
  const claimed = await tryClaimNotificationDedupe(supabase, "daily_ops_summary", {
    bookingId: `summary-${dayKey}`,
  });
  if (!claimed) return { ok: true, skipped: true };

  const start = `${dayKey}T00:00:00.000Z`;
  const end = `${dayKey}T23:59:59.999Z`;

  const since24hIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const untilIso = new Date().toISOString();

  const [
    { count: bookingsCreated },
    { count: completed },
    { count: reviews },
    { count: failedJobs },
    { count: lowRatedCleaners },
    { count: failedJobsLast24h },
    { count: cleanersNeedsReview },
    reviewFunnel24h,
  ] = await Promise.all([
    supabase.from("bookings").select("id", { count: "exact", head: true }).gte("created_at", start).lte("created_at", end),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .gte("completed_at", start)
      .lte("completed_at", end),
    supabase.from("reviews").select("id", { count: "exact", head: true }).gte("created_at", start).lte("created_at", end),
    supabase.from("failed_jobs").select("id", { count: "exact", head: true }),
    supabase
      .from("cleaners")
      .select("id", { count: "exact", head: true })
      .lt("rating", 3.5)
      .gte("review_count", 5),
    supabase.from("failed_jobs").select("id", { count: "exact", head: true }).gte("created_at", since24hIso),
    supabase.from("cleaners").select("id", { count: "exact", head: true }).eq("needs_quality_review", true),
    computeReviewPromptConversionRate(supabase, since24hIso, untilIso),
  ]);

  const context = {
    date: dayKey,
    bookings_created: bookingsCreated ?? 0,
    bookings_completed: completed ?? 0,
    reviews_submitted: reviews ?? 0,
    failed_jobs_total: failedJobs ?? 0,
    failed_jobs_created_last_24h: failedJobsLast24h ?? 0,
    cleaners_flagged_low_rating: lowRatedCleaners ?? 0,
    cleaners_needs_quality_review: cleanersNeedsReview ?? 0,
    review_funnel_24h: {
      prompts_sent: reviewFunnel24h.promptsSent,
      prompt_clicks: reviewFunnel24h.promptClicks,
      reviews_submitted: reviewFunnel24h.reviewsSubmitted,
      conversion_submitted_per_prompt:
        reviewFunnel24h.conversionRate != null ? Math.round(reviewFunnel24h.conversionRate * 10000) / 100 : null,
      click_through_pct:
        reviewFunnel24h.clickThroughRate != null ? Math.round(reviewFunnel24h.clickThroughRate * 10000) / 100 : null,
    },
    review_rate_submitted_per_completed_pct:
      (completed ?? 0) > 0 ? Math.round(((reviews ?? 0) / (completed ?? 0)) * 10000) / 100 : null,
  };

  await logSystemEvent({
    level: "info",
    source: "ops/daily_summary",
    message: `Daily ops summary ${dayKey}`,
    context,
  });

  return { ok: true, context };
}
