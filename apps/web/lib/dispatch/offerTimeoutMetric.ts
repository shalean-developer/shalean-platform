import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeCleanerUxVariant } from "@/lib/cleaner/cleanerOfferUxVariant";
import { compactDispatchMetricTags, loadDispatchMetricSegmentation } from "@/lib/dispatch/dispatchMetricContext";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { metrics } from "@/lib/metrics/counters";

/**
 * Emit `dispatch.offer.timeout` at most once per offer (insert dedupe).
 * Used by poll deadline expiry and cron SQL-TTL reconcile.
 */
export async function tryEmitDispatchOfferTimeoutMetric(params: {
  supabase: SupabaseClient;
  offerId: string;
  bookingId: string;
  cleanerId: string;
  latencyMs?: number;
  source: "poll_deadline" | "sql_ttl_reconcile";
  /** When known (e.g. SQL reconcile batch); otherwise loaded from `dispatch_offers`. */
  ux_variant?: string | null;
}): Promise<boolean> {
  const { error } = await params.supabase.from("dispatch_offer_timeout_metric_emitted").insert({
    offer_id: params.offerId,
  });

  if (error?.code === "23505") {
    return false;
  }
  if (error) {
    await logSystemEvent({
      level: "warn",
      source: "dispatch_offer_timeout_metric",
      message: error.message,
      context: { offerId: params.offerId, bookingId: params.bookingId, source: params.source },
    });
    return false;
  }

  let rawUx = params.ux_variant;
  if (rawUx === undefined) {
    const { data: off } = await params.supabase
      .from("dispatch_offers")
      .select("ux_variant")
      .eq("id", params.offerId)
      .maybeSingle();
    rawUx = (off as { ux_variant?: string | null } | null)?.ux_variant ?? null;
  }
  const ux_variant = sanitizeCleanerUxVariant(rawUx);
  const seg = await loadDispatchMetricSegmentation(params.supabase, params.bookingId);
  const metricTags = compactDispatchMetricTags({
    assignment_type: seg.assignment_type,
    fallback_reason: seg.fallback_reason,
    attempt_number: seg.attempt_number,
    location: seg.location,
    offer_cohort_tags: true,
  });

  metrics.increment("dispatch.offer.timeout", {
    bookingId: params.bookingId,
    offerId: params.offerId,
    cleanerId: params.cleanerId,
    latency_ms: params.latencyMs,
    source: params.source,
    ux_variant,
    ...metricTags,
  });
  return true;
}

const DEFAULT_LOOKBACK_H = 36;
const DEFAULT_BATCH = 400;

/**
 * Backfill metrics for offers expired by SQL (`expire_pending_dispatch_offers`) without Node poll.
 * Selects TTL-style expirations: responded_at >= expires_at (excludes early peer-expired losers).
 */
export async function emitSqlExpiredOfferTimeoutMetrics(
  supabase: SupabaseClient,
): Promise<{ scanned: number; emitted: number; skipped: number }> {
  const lookbackH = Number(process.env.DISPATCH_OFFER_TIMEOUT_METRIC_LOOKBACK_HOURS ?? DEFAULT_LOOKBACK_H);
  const hours = Number.isFinite(lookbackH) && lookbackH > 0 ? lookbackH : DEFAULT_LOOKBACK_H;
  const batch = Number(process.env.DISPATCH_OFFER_TIMEOUT_METRIC_BATCH ?? DEFAULT_BATCH);
  const limit = Number.isFinite(batch) && batch > 0 ? Math.min(batch, 800) : DEFAULT_BATCH;

  const since = new Date(Date.now() - hours * 60 * 60_000).toISOString();

  const { data, error } = await supabase
    .from("dispatch_offers")
    .select("id, booking_id, cleaner_id, expires_at, responded_at, ux_variant")
    .eq("status", "expired")
    .gte("responded_at", since)
    .not("expires_at", "is", null)
    .not("responded_at", "is", null)
    .order("responded_at", { ascending: true })
    .limit(limit);

  if (error) {
    await logSystemEvent({
      level: "warn",
      source: "dispatch_offer_timeout_reconcile",
      message: error.message,
      context: {},
    });
    return { scanned: 0, emitted: 0, skipped: 0 };
  }

  let emitted = 0;
  let skipped = 0;
  const rows = data ?? [];

  for (const raw of rows) {
    const row = raw as {
      id: string;
      booking_id?: string;
      cleaner_id?: string;
      expires_at?: string;
      responded_at?: string;
      ux_variant?: string | null;
    };
    const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : NaN;
    const respondedAt = row.responded_at ? new Date(row.responded_at).getTime() : NaN;
    if (!Number.isFinite(expiresAt) || !Number.isFinite(respondedAt) || respondedAt < expiresAt) {
      skipped++;
      continue;
    }

    const ok = await tryEmitDispatchOfferTimeoutMetric({
      supabase,
      offerId: String(row.id),
      bookingId: String(row.booking_id ?? ""),
      cleanerId: String(row.cleaner_id ?? ""),
      latencyMs: Math.max(0, respondedAt - expiresAt),
      source: "sql_ttl_reconcile",
      ux_variant: row.ux_variant ?? null,
    });
    if (ok) emitted++;
    else skipped++;
  }

  return { scanned: rows.length, emitted, skipped };
}
