import type { SupabaseClient } from "@supabase/supabase-js";

export type LifecycleMetricOutcome = "sent" | "failed" | "skipped";

/** Increment daily rollup counter (best-effort; does not throw). */
export async function incrementLifecycleMetric(
  supabase: SupabaseClient,
  params: { jobType: string; outcome: LifecycleMetricOutcome; at?: Date },
): Promise<void> {
  const at = params.at ?? new Date();
  const dateYmd = at.toISOString().slice(0, 10);
  const col =
    params.outcome === "sent"
      ? "sent_count"
      : params.outcome === "failed"
        ? "failed_count"
        : "skipped_count";

  const { data: existing } = await supabase
    .from("lifecycle_email_metrics")
    .select("sent_count, failed_count, skipped_count")
    .eq("date", dateYmd)
    .eq("job_type", params.jobType)
    .maybeSingle();

  if (existing) {
    const patch: Record<string, number> = {
      sent_count: existing.sent_count ?? 0,
      failed_count: existing.failed_count ?? 0,
      skipped_count: existing.skipped_count ?? 0,
    };
    patch[col] = (patch[col] ?? 0) + 1;
    await supabase
      .from("lifecycle_email_metrics")
      .update(patch)
      .eq("date", dateYmd)
      .eq("job_type", params.jobType);
    return;
  }

  const row = {
    date: dateYmd,
    job_type: params.jobType,
    sent_count: col === "sent_count" ? 1 : 0,
    failed_count: col === "failed_count" ? 1 : 0,
    skipped_count: col === "skipped_count" ? 1 : 0,
  };
  await supabase.from("lifecycle_email_metrics").insert(row);
}

/** Aggregate yesterday's jobs into lifecycle_email_metrics (idempotent upsert). */
export async function upsertLifecycleEmailMetricsForDate(
  supabase: SupabaseClient,
  dateYmd: string,
): Promise<{ upserted: number }> {
  const start = `${dateYmd}T00:00:00.000Z`;
  const endDate = new Date(`${dateYmd}T00:00:00.000Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  const end = endDate.toISOString();

  const jobTypes = ["reminder_24h", "review_request", "rebook_offer", "rebook_reminder"] as const;
  let upserted = 0;

  for (const jobType of jobTypes) {
    const [sentRes, failedRes, skippedRes] = await Promise.all([
      supabase
        .from("booking_lifecycle_jobs")
        .select("id", { count: "exact", head: true })
        .eq("job_type", jobType)
        .eq("status", "sent")
        .gte("sent_at", start)
        .lt("sent_at", end),
      supabase
        .from("booking_lifecycle_jobs")
        .select("id", { count: "exact", head: true })
        .eq("job_type", jobType)
        .in("status", ["failed_retryable", "failed_terminal"])
        .gte("processed_at", start)
        .lt("processed_at", end),
      supabase
        .from("booking_lifecycle_jobs")
        .select("id", { count: "exact", head: true })
        .eq("job_type", jobType)
        .eq("status", "skipped")
        .gte("processed_at", start)
        .lt("processed_at", end),
    ]);

    const row = {
      date: dateYmd,
      job_type: jobType,
      sent_count: sentRes.count ?? 0,
      failed_count: failedRes.count ?? 0,
      skipped_count: skippedRes.count ?? 0,
    };

    const { error } = await supabase.from("lifecycle_email_metrics").upsert(row, {
      onConflict: "date,job_type",
    });
    if (!error) upserted++;
  }

  return { upserted };
}

/** Roll up metrics for yesterday if not already done today. */
export async function maybeRollupYesterdayLifecycleMetrics(
  supabase: SupabaseClient,
): Promise<{ rolled: boolean; date?: string }> {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const dateYmd = yesterday.toISOString().slice(0, 10);

  const { count } = await supabase
    .from("lifecycle_email_metrics")
    .select("date", { count: "exact", head: true })
    .eq("date", dateYmd);

  if ((count ?? 0) >= 4) return { rolled: false };

  await upsertLifecycleEmailMetricsForDate(supabase, dateYmd);
  return { rolled: true, date: dateYmd };
}
