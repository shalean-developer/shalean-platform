import { NextResponse } from "next/server";
import { evaluateLifecycleEmailAlerts } from "@/lib/admin/lifecycleEmailMonitoring";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const weekStart = new Date(todayStart);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);

  const [
    sentTodayRes,
    sentWeekRes,
    failedRes,
    skippedRes,
    sentTotalRes,
    reviewSentRes,
    reviewConvertedRes,
    rebookSentRes,
    metricsRes,
    topErrorsRes,
    topSkipRes,
    monitoring,
  ] = await Promise.all([
    admin
      .from("booking_lifecycle_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent")
      .gte("sent_at", todayStart.toISOString()),
    admin
      .from("booking_lifecycle_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent")
      .gte("sent_at", weekStart.toISOString()),
    admin
      .from("booking_lifecycle_jobs")
      .select("id", { count: "exact", head: true })
      .in("status", ["failed_retryable", "failed_terminal"]),
    admin
      .from("booking_lifecycle_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "skipped"),
    admin
      .from("booking_lifecycle_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent"),
    admin
      .from("booking_lifecycle_jobs")
      .select("booking_id")
      .eq("job_type", "review_request")
      .eq("status", "sent"),
    admin.from("reviews").select("booking_id"),
    admin
      .from("booking_lifecycle_jobs")
      .select("id, booking_id, customer_email, sent_at")
      .in("job_type", ["rebook_offer", "rebook_reminder"])
      .eq("status", "sent")
      .not("sent_at", "is", null)
      .limit(500),
    admin
      .from("lifecycle_email_metrics")
      .select("date, job_type, sent_count, failed_count, skipped_count")
      .gte("date", weekStart.toISOString().slice(0, 10))
      .order("date", { ascending: true }),
    admin
      .from("booking_lifecycle_jobs")
      .select("last_error")
      .in("status", ["failed_retryable", "failed_terminal"])
      .not("last_error", "is", null)
      .limit(500),
    admin
      .from("booking_lifecycle_jobs")
      .select("skipped_reason")
      .eq("status", "skipped")
      .not("skipped_reason", "is", null)
      .limit(500),
    evaluateLifecycleEmailAlerts(admin),
  ]);

  const sentToday = sentTodayRes.count ?? 0;
  const sentWeek = sentWeekRes.count ?? 0;
  const failed = failedRes.count ?? 0;
  const skipped = skippedRes.count ?? 0;
  const sentTotal = sentTotalRes.count ?? 0;
  const attempts = sentTotal + failed;
  const deliverySuccessRate = attempts > 0 ? Math.round((sentTotal / attempts) * 1000) / 10 : null;
  const failureRate = attempts > 0 ? Math.round((failed / attempts) * 1000) / 10 : null;
  const skipRate =
    sentTotal + skipped + failed > 0
      ? Math.round((skipped / (sentTotal + skipped + failed)) * 1000) / 10
      : null;

  const reviewBookingIds = new Set(
    (reviewSentRes.data ?? []).map((r) => r.booking_id).filter(Boolean),
  );
  const reviewIdsWithReview = new Set(
    (reviewConvertedRes.data ?? []).map((r) => r.booking_id).filter(Boolean),
  );
  let reviewConverted = 0;
  for (const id of reviewBookingIds) {
    if (reviewIdsWithReview.has(id)) reviewConverted++;
  }
  const reviewConversionRate =
    reviewBookingIds.size > 0
      ? Math.round((reviewConverted / reviewBookingIds.size) * 1000) / 10
      : null;

  let rebookConverted = 0;
  const rebookJobs = rebookSentRes.data ?? [];
  for (const job of rebookJobs) {
    const sentAt = job.sent_at as string | null;
    const email = job.customer_email as string | null;
    if (!sentAt || !email) continue;
    const windowEnd = new Date(Date.parse(sentAt) + 30 * 24 * 60 * 60_000).toISOString();
    const { count } = await admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("customer_email", email)
      .gt("created_at", sentAt)
      .lte("created_at", windowEnd);
    if ((count ?? 0) > 0) rebookConverted++;
  }
  const rebookConversionRate =
    rebookJobs.length > 0 ? Math.round((rebookConverted / rebookJobs.length) * 1000) / 10 : null;

  function topReasons(rows: { last_error?: string | null; skipped_reason?: string | null }[], key: "last_error" | "skipped_reason") {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const val = row[key]?.trim();
      if (!val) continue;
      counts.set(val, (counts.get(val) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count }));
  }

  return NextResponse.json({
    sentToday,
    sentWeek,
    deliverySuccessRate,
    failureRate,
    skipRate,
    topFailureReasons: topReasons(topErrorsRes.data ?? [], "last_error"),
    topSkipReasons: topReasons(topSkipRes.data ?? [], "skipped_reason"),
    reviewConversionRate,
    reviewConverted,
    reviewSent: reviewBookingIds.size,
    rebookConversionRate,
    rebookConverted,
    rebookSent: rebookJobs.length,
    dailyTrend: metricsRes.data ?? [],
    monitoring,
  });
}
