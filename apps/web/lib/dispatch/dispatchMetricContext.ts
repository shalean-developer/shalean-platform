import type { SupabaseClient } from "@supabase/supabase-js";

/** Common dimensions for dispatch KPI / funnel metrics. */
export type DispatchMetricSegmentation = {
  assignment_type: string | null;
  fallback_reason: string | null;
  attempt_number: number;
  /** First line of booking address for coarse cohort tagging (optional). */
  location: string | null;
};

/** `became_pending_at` when set, else `created_at` — for time-to-first-offer only. */
export function firstOfferMetricAnchorIso(row: {
  became_pending_at?: string | null;
  created_at?: string | null;
}): string | null {
  const bp = row.became_pending_at;
  if (typeof bp === "string" && bp.trim().length > 0) return bp.trim();
  const cr = row.created_at;
  if (typeof cr === "string" && cr.trim().length > 0) return cr.trim();
  return null;
}

const METRIC_ASSIGNMENT_TYPE_MAX = 48;
const METRIC_FALLBACK_REASON_MAX = 64;

/** Low-cardinality bucket for metrics backends (`6+` = six or more). */
export function metricAttemptBucket(attempt: number): string {
  const n = Number.isFinite(attempt) ? Math.floor(attempt) : 0;
  if (n <= 0) return "0";
  if (n <= 5) return String(n);
  return "6+";
}

export function metricFallbackReasonTag(reason: string | null): string | null {
  if (reason == null) return null;
  const s = String(reason).trim().toLowerCase();
  if (!s) return null;
  return s.slice(0, METRIC_FALLBACK_REASON_MAX);
}

export function metricAssignmentTypeTag(assignmentType: string | null): string | null {
  if (assignmentType == null) return null;
  const s = String(assignmentType).trim().toLowerCase();
  if (!s) return null;
  return s.slice(0, METRIC_ASSIGNMENT_TYPE_MAX);
}

const METRIC_LOCATION_ZONE_MAX = 32;

/**
 * Coarse zone from booking `location` (first segment, alnum) for dashboard cuts.
 * Always returns a tag string so cohort slices never drop `location_zone`.
 */
export function metricLocationZoneTag(location: string | null | undefined): string {
  if (location == null) return "unknown";
  const first = String(location).split(",")[0]?.trim().toLowerCase() ?? "";
  if (!first) return "unknown";
  const safe = first
    .replace(/[^a-z0-9 _-]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, METRIC_LOCATION_ZONE_MAX);
  return safe || "unknown";
}

/**
 * Peak vs off-peak in `DISPATCH_METRICS_TZ` (default Africa/Johannesburg).
 * Weekday 08:00–18:59 local → peak; else off_peak.
 */
export function metricTimeOfDayBucket(now = new Date(), timeZone = process.env.DISPATCH_METRICS_TZ ?? "Africa/Johannesburg"): "peak" | "off_peak" {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? NaN);
  const weekend = wd === "Sat" || wd === "Sun";
  if (weekend || !Number.isFinite(hour)) return "off_peak";
  if (hour >= 8 && hour < 19) return "peak";
  return "off_peak";
}

/** Tags for `metrics.increment` — bounded strings + `attempt_bucket` (no raw attempt count). */
export function compactDispatchMetricTags(input: {
  assignment_type: string | null;
  fallback_reason: string | null;
  attempt_number: number;
  /** When true, adds `time_window` + `location_zone` for offer-funnel A/B cohort cuts. */
  offer_cohort_tags?: boolean;
  location?: string | null;
}): {
  assignment_type: string | null;
  fallback_reason: string | null;
  attempt_bucket: string;
  time_window?: "peak" | "off_peak";
  location_zone?: string;
} {
  const base = {
    assignment_type: metricAssignmentTypeTag(input.assignment_type),
    fallback_reason: metricFallbackReasonTag(input.fallback_reason),
    attempt_bucket: metricAttemptBucket(input.attempt_number),
  };
  if (!input.offer_cohort_tags) {
    return base;
  }
  return {
    ...base,
    time_window: metricTimeOfDayBucket(),
    location_zone: metricLocationZoneTag(input.location),
  };
}

export type LoadDispatchMetricSegmentationOptions = {
  /** Include SLA anchors (one round-trip vs separate query in offer creation). */
  includePendingAnchors?: boolean;
};

export async function loadDispatchMetricSegmentation(
  supabase: SupabaseClient,
  bookingId: string,
  options?: LoadDispatchMetricSegmentationOptions,
): Promise<
  DispatchMetricSegmentation & {
    became_pending_at?: string | null;
    created_at?: string | null;
  }
> {
  const cols = options?.includePendingAnchors
    ? "assignment_type, fallback_reason, dispatch_attempt_count, became_pending_at, created_at, location"
    : "assignment_type, fallback_reason, dispatch_attempt_count, location";

  const { data } = await supabase.from("bookings").select(cols).eq("id", bookingId).maybeSingle();

  const row = data as {
    assignment_type?: string | null;
    fallback_reason?: string | null;
    dispatch_attempt_count?: number | null;
    became_pending_at?: string | null;
    created_at?: string | null;
    location?: string | null;
  } | null;

  return {
    assignment_type: row?.assignment_type != null ? String(row.assignment_type) : null,
    fallback_reason: row?.fallback_reason != null ? String(row.fallback_reason) : null,
    attempt_number: Number(row?.dispatch_attempt_count ?? 0) || 0,
    became_pending_at: row?.became_pending_at ?? null,
    created_at: row?.created_at ?? null,
    location: row?.location != null ? String(row.location) : null,
  };
}
