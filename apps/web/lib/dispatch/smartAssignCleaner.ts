import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueDispatchRetry } from "@/lib/dispatch/dispatchRetryQueue";
import {
  dispatchTieredWindowsEnabled,
  MAX_PARALLEL_OFFERS,
  MAX_PARALLEL_OFFERS_PEAK,
} from "@/lib/dispatch/dispatchConstants";
import { buildDispatchTiers } from "@/lib/dispatch/buildDispatchTiers";
import { planDispatchTierWindows } from "@/lib/dispatch/planDispatchTierWindows";
import { scoreCleanerForJob } from "@/lib/dispatch/scoreCleanerForJob";
import {
  buildCleanerRankingWindowStats,
  computeCleanerRankingV1Bundle,
  rankingV1DispatchAdjustment,
  responsePenalty01FromAvgMs,
  type CleanerTerminalBookingRow,
} from "@/lib/dispatch/cleanerRankingV1";
import { loadCleanerDispatchPerformanceScores } from "@/lib/dispatch/cleanerDispatchPerformance";
import { haversineDistanceKm } from "@/lib/dispatch/distance";
import { runParallelDispatchOfferRace, runTieredParallelDispatchOfferRace } from "@/lib/dispatch/offerRace";
import { getDistanceKm } from "@/lib/dispatch/routeOptimization";
import { getDefaultTravelTimeProvider } from "@/lib/dispatch/travelProvider";
import type { TravelTimeProvider } from "@/lib/dispatch/travelProviderTypes";
import { getTravelMinutesBetweenAreas } from "@/lib/dispatch/travelCache";
import { getEligibleCleaners } from "@/lib/booking/getEligibleCleaners";
import type { CleanerRow, SmartDispatchCandidate } from "@/lib/dispatch/types";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { notifyCleanerAssignedBooking } from "@/lib/dispatch/notifyCleanerAssigned";
import { predictAcceptanceProbability } from "@/lib/marketplace-intelligence/acceptanceProbability";
import { scoreCleanerForBooking } from "@/lib/marketplace-intelligence/cleanerScoring";
import type { AssignmentWeights } from "@/lib/ai-autonomy/modelWeights";
import { predictCleanerAcceptanceSync } from "@/lib/ai-autonomy/predictions";
import { computeAiDispatchDelta } from "@/lib/ai-autonomy/assignmentBlend";
import { getAiAutonomyFlags } from "@/lib/ai-autonomy/flags";
import { marketplaceBookingPatchOnAssign } from "@/lib/marketplace-intelligence/marketplaceBookingMeta";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";
import { resolveDispatchOfferAcceptTtlSeconds } from "@/lib/dispatch/dispatchOfferAcceptTtl";
import { getWhatsAppQueueStatusCounts } from "@/lib/whatsapp/queue";
import {
  cleanerPreferenceStrictExcludesJob,
  computePreferenceScore01,
  hasConfiguredPreferences,
  type CleanerPreferenceRowLike,
} from "@/lib/dispatch/cleanerPreferenceMatch";

export type { SmartDispatchCandidate } from "@/lib/dispatch/types";

/** High-volume "cleaner passed filter" logs: sample to reduce DB noise (Phase 8F). Exclusions always log. */
function shouldLogDispatchFilterDebug(included: boolean): boolean {
  if (!included) return true;
  const raw = process.env.DISPATCH_FILTER_DEBUG_LOG_SAMPLE_RATE?.trim();
  if (raw === "0" || raw?.toLowerCase() === "off") return false;
  const r = raw != null && raw !== "" ? Number(raw) : 0.1;
  if (!Number.isFinite(r) || r >= 1) return true;
  if (r <= 0) return false;
  return Math.random() < r;
}

export type AssignParams = {
  bookingId: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  time: string;
  locationId: string;
  cityId?: string | null;
};

export type DemandLevel = "low" | "normal" | "peak";

export type SmartAssignOptions = {
  randomFn?: () => number;
  travelProvider?: TravelTimeProvider;
  assignmentMode?: "instant" | "soft";
  offerTimeoutMs?: number;
  maxSoftOffers?: number;
  maxCandidates?: number;
  searchExpansion?: "none" | "city" | "broadcast";
  /** From retry queue / escalation (drives parallel count + broadcast). */
  retryTier?: number;
  /** Exclude cleaners (e.g. customer’s pick that could not be honored at checkout). */
  excludeCleanerIds?: readonly string[];
  /** Phase-5: experiment arm + preloaded weights (from `assignBestCleaner`). */
  aiAssignmentVariant?: "control" | "variant";
  aiAssignmentWeights?: AssignmentWeights;
};

export type SmartAssignResult =
  | { ok: true; cleanerId: string; score: number }
  | {
      ok: false;
      error:
        | "no_candidate"
        | "booking_not_pending"
        | "db_error"
        | "params_mismatch"
        | "invalid_booking_time"
        | "missing_job_coordinates";
      message?: string;
    };

export type DispatchScoreContext = {
  distanceKm?: number;
  travelMinutes?: number;
  trafficFactor?: number;
  cleanerTier?: number;
};

export type DispatchScoreV4Input = {
  rating: number;
  totalJobs: number;
  jobsLast7Days: number;
  distanceKm: number;
  acceptanceLifetime: number;
  acceptanceRecent: number;
  avgResponseTimeMs: number | null;
  fatigueOffersLastHour: number;
  tier: string | null | undefined;
  demandLevel: DemandLevel;
  surgeMultiplier: number;
  /** Tighten score when supply >> demand. */
  supplyRatioStricter: boolean;
  randomJitter?: number;
};

const DEFAULT_JOB_DURATION_MIN = 180;
const TRAVEL_BUFFER_MIN = 30;
const DEFAULT_MAX_CANDIDATES = 10;
const DEFAULT_MAX_SOFT_OFFERS = 9;
const DEFAULT_OFFER_TIMEOUT_MS = 60_000;

export { MAX_PARALLEL_OFFERS, MAX_PARALLEL_OFFERS_PEAK };

const FORCED_PRIORITY_CLEANER_ID = "abe30dda-a927-4f75-b204-c7165f6eadd0";

function defaultAssignmentMode(): "instant" | "soft" {
  return "soft";
}

/**
 * v4 marketplace score: rating, experience, fairness, distance, blended acceptance,
 * response speed, fatigue, tier, surge/demand modulation, jitter.
 */
export function computeDispatchScoreV4(input: DispatchScoreV4Input, _ctx?: DispatchScoreContext): number {
  const r = Number.isFinite(input.rating) ? input.rating : 0;
  const j = Number.isFinite(input.totalJobs) ? Math.max(0, input.totalJobs) : 0;
  const w = Number.isFinite(input.jobsLast7Days) ? Math.max(0, input.jobsLast7Days) : 0;
  const d = Number.isFinite(input.distanceKm) && input.distanceKm >= 0 ? input.distanceKm : 0;
  const life = Number.isFinite(input.acceptanceLifetime) ? Math.min(1, Math.max(0, input.acceptanceLifetime)) : 1;
  const recent = Number.isFinite(input.acceptanceRecent) ? Math.min(1, Math.max(0, input.acceptanceRecent)) : 1;
  const jitter = Number.isFinite(input.randomJitter) ? input.randomJitter! : Math.random();

  const distanceScore = 10 / (d + 1);
  const experienceBoost = (1 / (j + 1)) * 5;
  let fairnessBoost = 5 / (w + 1);
  if (input.demandLevel === "low") fairnessBoost *= 1.25;

  const ratingScore = r * 2;
  const blendedAccept = 0.7 * recent + 0.3 * life;
  let acceptanceScore = blendedAccept * 5;
  if (input.demandLevel === "peak") {
    const surgeBoost = Math.min(0.25, Math.max(0, (input.surgeMultiplier - 1) * 0.12) + (recent > 0.85 ? 0.08 : 0));
    acceptanceScore *= 1 + surgeBoost;
  }

  const avgMs =
    input.avgResponseTimeMs != null && input.avgResponseTimeMs > 0 && Number.isFinite(input.avgResponseTimeMs)
      ? input.avgResponseTimeMs
      : 5000;
  const speedScore = 3 / (avgMs / 1000 + 1);

  const fatiguePenalty = (Number.isFinite(input.fatigueOffersLastHour) ? Math.max(0, input.fatigueOffersLastHour) : 0) * -1;

  const t = String(input.tier ?? "bronze").toLowerCase();
  const tierBoost = t === "gold" ? 3 : t === "silver" ? 1 : 0;

  let core =
    ratingScore +
    experienceBoost +
    fairnessBoost +
    distanceScore +
    acceptanceScore +
    speedScore +
    fatiguePenalty +
    tierBoost;

  if (input.supplyRatioStricter) core *= 0.97;

  return core + jitter;
}

/** @deprecated Prefer computeDispatchScoreV4 — kept for narrow backward compatibility. */
export function computeDispatchScore(
  rating: number,
  totalJobs: number,
  jobsLast7Days: number,
  distanceKm: number,
  acceptanceRate: number,
  randomJitter: number = Math.random(),
  ctx?: DispatchScoreContext,
): number {
  return computeDispatchScoreV4(
    {
      rating,
      totalJobs,
      jobsLast7Days,
      distanceKm,
      acceptanceLifetime: acceptanceRate,
      acceptanceRecent: acceptanceRate,
      avgResponseTimeMs: null,
      fatigueOffersLastHour: 0,
      tier: "bronze",
      demandLevel: "normal",
      surgeMultiplier: 1,
      supplyRatioStricter: false,
      randomJitter,
    },
    ctx,
  );
}

function normalizeHm(h: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(h).trim());
  if (!m) return String(h).trim();
  const hh = Number(m[1]);
  const mm = m[2];
  if (!Number.isFinite(hh) || hh > 23) return String(h).trim();
  return `${String(hh).padStart(2, "0")}:${mm}`;
}

function timeHmToMinutes(hm: string): number {
  const n = normalizeHm(hm);
  const parts = n.split(":");
  if (parts.length < 2) return NaN;
  const h = Number(parts[0]);
  const mi = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return NaN;
  return h * 60 + mi;
}

function dateYmdDaysAgo(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

type LocCoords = { lat: number; lon: number };

function cleanerCoords(c: {
  latitude?: number | null;
  longitude?: number | null;
  home_lat?: number | null;
  home_lng?: number | null;
}): LocCoords | null {
  const lat = c.latitude ?? c.home_lat;
  const lon = c.longitude ?? c.home_lng;
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

type DayInterval = { start: number; end: number; location_id: string | null };

function intervalFromRow(timeHm: string, durationMin: number | null | undefined): { start: number; end: number } | null {
  const start = timeHmToMinutes(timeHm);
  if (!Number.isFinite(start)) return null;
  const d = durationMin ?? DEFAULT_JOB_DURATION_MIN;
  return { start, end: start + d };
}

function intervalsOverlap(a: DayInterval, b: DayInterval): boolean {
  return a.start < b.end && a.end > b.start;
}

async function passesTravelAndOverlapAsync(params: {
  supabase: SupabaseClient;
  existing: DayInterval[];
  newIv: DayInterval;
  newLocationId: string;
  locCoords: Map<string, LocCoords>;
  fallback: LocCoords;
  innerTravel: TravelTimeProvider;
}): Promise<boolean> {
  const { supabase, existing, newIv, newLocationId, locCoords, fallback, innerTravel } = params;

  for (const ex of existing) {
    if (intervalsOverlap(ex, newIv)) return false;
  }

  const resolvePoint = (locId: string | null): LocCoords => {
    if (locId && locCoords.has(locId)) return locCoords.get(locId)!;
    return fallback;
  };

  const newPoint = resolvePoint(newLocationId);

  const prev = existing.reduce<DayInterval | null>((best, e) => {
    if (e.end > newIv.start) return best;
    if (!best || e.end > best.end) return e;
    return best;
  }, null);

  const next = existing.reduce<DayInterval | null>((best, e) => {
    if (e.start < newIv.end) return best;
    if (!best || e.start < best.start) return e;
    return best;
  }, null);

  const ll = (p: LocCoords) => ({ lat: p.lat, lng: p.lon });

  if (prev) {
    const p = resolvePoint(prev.location_id);
    const travel = await getTravelMinutesBetweenAreas({
      supabase,
      originLocationId: prev.location_id,
      destLocationId: newLocationId,
      origin: ll(p),
      destination: ll(newPoint),
      inner: innerTravel,
    });
    const gap = newIv.start - prev.end;
    if (gap < travel + TRAVEL_BUFFER_MIN) return false;
  }

  if (next) {
    const t = resolvePoint(next.location_id);
    const travel = await getTravelMinutesBetweenAreas({
      supabase,
      originLocationId: newLocationId,
      destLocationId: next.location_id,
      origin: ll(newPoint),
      destination: ll(t),
      inner: innerTravel,
    });
    const gap = next.start - newIv.end;
    if (gap < travel + TRAVEL_BUFFER_MIN) return false;
  }

  return true;
}

async function resolveLocationIdsForCleaners(
  supabase: SupabaseClient,
  locationId: string,
  searchExpansion: "none" | "city" | "broadcast",
): Promise<string[] | null> {
  if (searchExpansion === "broadcast") return null;
  if (searchExpansion !== "city") return [locationId];
  const { data: loc } = await supabase.from("locations").select("city").eq("id", locationId).maybeSingle();
  const city = String((loc as { city?: string | null } | null)?.city ?? "").trim();
  if (!city) return [locationId];
  const { data: rows } = await supabase.from("locations").select("id").eq("city", city);
  const ids = (rows ?? [])
    .map((r) => (r && typeof r === "object" && "id" in r ? String((r as { id: string }).id) : ""))
    .filter(Boolean);
  return ids.length ? ids : [locationId];
}

/** Buffered during scoring; enriched to {@link DispatchRankingV1MetricRow} after sort. */
type DispatchRankingV1MetricPending = {
  cleaner_id: string;
  booking_id: string;
  date_ymd: string;
  score_before_ranking_v1: number;
  v1_bundle: number;
  v1_ranking_adjustment: number;
  final_dispatch_score: number;
  acceptance_rate_blend: number;
  completion_rate_window: number;
  cleaner_cancellation_rate_window: number;
  response_penalty_01: number;
  recency_01: number;
  distance_km: number;
};

export type DispatchRankingV1MetricRow = DispatchRankingV1MetricPending & {
  dispatch_rank_by_score: number;
  /** Same as dispatch_rank_by_score (1 = top composite score). */
  rank_position: number;
  is_primary_candidate: boolean;
  in_dispatch_slice: boolean;
};

export type FindSmartDispatchCandidatesResult = {
  candidates: SmartDispatchCandidate[];
  /** Populated when DISPATCH_RANKING_V1_METRICS sampling passes; flush after known assignee in smartAssignCleaner. */
  rankingV1MetricRows: DispatchRankingV1MetricRow[];
};

function emptyFindSmartDispatchCandidates(): FindSmartDispatchCandidatesResult {
  return { candidates: [], rankingV1MetricRows: [] };
}

/** Writes one row per candidate; set `assignedCleanerId` when dispatch committed (instant top or soft race winner). */
function flushDispatchRankingV1MetricRows(rows: DispatchRankingV1MetricRow[], assignedCleanerId: string | null): void {
  if (!rows.length || process.env.DISPATCH_RANKING_V1_METRICS !== "true") return;
  for (const row of rows) {
    void logSystemEvent({
      level: "info",
      source: "dispatch.ranking.v1",
      message: "dispatch ranking v1 candidate metrics",
      context: {
        ...row,
        is_selected: assignedCleanerId != null && row.cleaner_id === assignedCleanerId,
      },
    });
  }
}

export async function findSmartDispatchCandidates(
  supabase: SupabaseClient,
  params: {
    dateYmd: string;
    timeHm: string;
    locationId: string;
    cityId?: string | null;
    /** Canonical booking service slug for preference match (e.g. `standard`). */
    jobServiceSlug?: string | null;
    newJobDurationMinutes?: number | null;
    searchExpansion?: "none" | "city" | "broadcast";
    demandLevel?: DemandLevel;
    surgeMultiplier?: number;
    supplyRatioStricter?: boolean;
    retryTier?: number;
  },
  options?: {
    randomFn?: () => number;
    travelProvider?: TravelTimeProvider;
    maxCandidates?: number;
    excludeCleanerIds?: readonly string[];
    /** Emits `cleaner_scored` marketplace intelligence event (top candidates). */
    intelligenceTelemetry?: { bookingId: string };
    aiAssignmentVariant?: "control" | "variant";
    aiAssignmentWeights?: AssignmentWeights;
  },
): Promise<FindSmartDispatchCandidatesResult> {
  const { dateYmd, timeHm, locationId } = params;
  const cityId = params.cityId ?? null;
  const newJobDuration = params.newJobDurationMinutes ?? DEFAULT_JOB_DURATION_MIN;
  const searchExpansion = params.searchExpansion ?? "none";
  const demandLevel: DemandLevel = params.demandLevel ?? "normal";
  const surgeMultiplier = Number.isFinite(params.surgeMultiplier) ? (params.surgeMultiplier as number) : 1;
  const supplyRatioStricter = params.supplyRatioStricter ?? false;
  const rand = options?.randomFn ?? Math.random;
  const innerTravel = options?.travelProvider ?? getDefaultTravelTimeProvider();
  const maxCandidates = options?.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  const excludeCleanerIds = new Set((options?.excludeCleanerIds ?? []).map((id) => String(id).trim()).filter(Boolean));

  const { data: jobLoc, error: locErr } = await supabase
    .from("locations")
    .select("id, latitude, longitude")
    .eq("id", locationId)
    .maybeSingle();

  if (locErr) {
    await reportOperationalIssue("warn", "findSmartDispatchCandidates", `location: ${locErr.message}`, {
      dateYmd,
      locationId,
    });
  }

  let jobLat: number | null = null;
  let jobLon: number | null = null;
  if (jobLoc && typeof jobLoc === "object") {
    const la = (jobLoc as { latitude?: number | null }).latitude;
    const lo = (jobLoc as { longitude?: number | null }).longitude;
    if (la != null && lo != null && Number.isFinite(la) && Number.isFinite(lo)) {
      jobLat = la;
      jobLon = lo;
    }
  }

  if (jobLat == null || jobLon == null) {
    await reportOperationalIssue("warn", "findSmartDispatchCandidates", "Location missing coordinates", {
      locationId,
      dateYmd,
    });
    return emptyFindSmartDispatchCandidates();
  }

  const cleanerLocationIds = await resolveLocationIdsForCleaners(supabase, locationId, searchExpansion);
  const expandedForEligibility =
    searchExpansion === "broadcast"
      ? null
      : cleanerLocationIds?.length
        ? cleanerLocationIds
        : [locationId];

  const eligibleCards = await getEligibleCleaners(supabase, {
    date: dateYmd,
    startTime: normalizeHm(timeHm),
    durationMinutes: newJobDuration,
    locationId,
    locationExpandedIds: expandedForEligibility,
    limit: 500,
  });
  const eligibleFromUnified = new Set(eligibleCards.map((c) => c.id));

  if (eligibleFromUnified.size === 0) return emptyFindSmartDispatchCandidates();

  let cleanersQuery = supabase
    .from("cleaners")
    .select(
      "id, full_name, rating, jobs_completed, review_count, status, location_id, city_id, latitude, longitude, home_lat, home_lng, acceptance_rate, acceptance_rate_recent, total_offers, accepted_offers, avg_response_time_ms, tier, priority_score, marketplace_outcome_ema, needs_quality_review",
    )
    .neq("status", "offline")
    .eq("is_available", true)
    .in("id", [...eligibleFromUnified]);

  if (cityId) {
    cleanersQuery = cleanersQuery.eq("city_id", cityId);
  }

  const { data: cleaners, error: cErr } = await cleanersQuery;

  if (cErr || !cleaners?.length) {
    if (cErr) {
      await reportOperationalIssue("warn", "findSmartDispatchCandidates", `cleaners: ${cErr.message}`, {
        dateYmd,
        locationId,
      });
    }
    return emptyFindSmartDispatchCandidates();
  }

  const { data: conflicts } = await supabase
    .from("bookings")
    .select("cleaner_id")
    .eq("date", dateYmd)
    .eq("time", timeHm)
    .in("status", ["assigned", "in_progress"]);

  const taken = new Set(
    (conflicts ?? [])
      .map((c) =>
        c && typeof c === "object" && "cleaner_id" in c ? String((c as { cleaner_id?: string }).cleaner_id ?? "") : "",
      )
      .filter(Boolean),
  );

  const baseCleaners = (cleaners as (CleanerRow & {
    city_id?: string | null;
    location_id?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    home_lat?: number | null;
    home_lng?: number | null;
    acceptance_rate?: number | null;
    acceptance_rate_recent?: number | null;
    avg_response_time_ms?: number | null;
    tier?: string | null;
  })[]).filter((c) => c.id && !taken.has(c.id) && !excludeCleanerIds.has(c.id));

  if (baseCleaners.length === 0) return emptyFindSmartDispatchCandidates();

  const ids = baseCleaners.map((c) => c.id);
  const declineByCleaner = new Map<string, number>();
  const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const since1h = new Date(Date.now() - 3600_000).toISOString();
  const minWeekDate = dateYmdDaysAgo(7);

  const min90dDate = dateYmdDaysAgo(90);
  const [
    { data: dayRows },
    { data: weekRows },
    { data: offerFatigueRows },
    { data: declineRows },
    perfByCleaner,
    { data: terminalRows },
    { data: preferenceRows },
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select("cleaner_id, time, location_id, duration_minutes, status")
      .eq("date", dateYmd)
      .in("cleaner_id", ids)
      .in("status", ["assigned", "in_progress", "completed"]),
    supabase
      .from("bookings")
      .select("cleaner_id")
      .in("cleaner_id", ids)
      .gte("date", minWeekDate)
      .in("status", ["completed", "assigned", "in_progress"]),
    supabase.from("dispatch_offers").select("cleaner_id").gte("created_at", since1h).in("cleaner_id", ids),
    ids.length
      ? supabase
          .from("dispatch_offers")
          .select("cleaner_id")
          .in("cleaner_id", ids)
          .eq("status", "rejected")
          .gte("created_at", since7d)
      : Promise.resolve({ data: [] as { cleaner_id?: string }[], error: null }),
    loadCleanerDispatchPerformanceScores(supabase, ids),
    ids.length
      ? supabase
          .from("bookings")
          .select("cleaner_id, status, completed_at, cancelled_by")
          .in("cleaner_id", ids)
          .gte("date", min90dDate)
          .in("status", ["completed", "cancelled", "failed"])
      : Promise.resolve({ data: [] as CleanerTerminalBookingRow[], error: null }),
    ids.length
      ? supabase
          .from("cleaner_preferences")
          .select("cleaner_id, preferred_areas, preferred_services, preferred_time_blocks, is_strict")
          .in("cleaner_id", ids)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
  ]);

  const prefByCleaner = new Map<string, CleanerPreferenceRowLike>();
  for (const raw of preferenceRows ?? []) {
    const cid = String((raw as { cleaner_id?: string }).cleaner_id ?? "");
    if (cid) prefByCleaner.set(cid, raw as CleanerPreferenceRowLike);
  }

  const jobServiceNorm = (params.jobServiceSlug ?? "").trim().toLowerCase() || null;
  const jobPrefCtx = {
    jobLocationId: locationId,
    jobServiceSlug: jobServiceNorm,
    jobDateYmd: dateYmd,
    jobTimeHm: normalizeHm(timeHm),
  };

  const rankingByCleaner = buildCleanerRankingWindowStats((terminalRows ?? []) as CleanerTerminalBookingRow[], ids);

  const lastReviewAtByCleaner = new Map<string, number>();
  if (ids.length) {
    const { data: revTimeRows } = await supabase
      .from("reviews")
      .select("cleaner_id, created_at")
      .in("cleaner_id", ids)
      .eq("is_hidden", false)
      .order("created_at", { ascending: false })
      .limit(500);
    for (const raw of revTimeRows ?? []) {
      const r = raw as { cleaner_id?: string; created_at?: string };
      const cid = String(r.cleaner_id ?? "");
      if (!cid || lastReviewAtByCleaner.has(cid)) continue;
      const t = new Date(String(r.created_at ?? "")).getTime();
      if (Number.isFinite(t)) lastReviewAtByCleaner.set(cid, t);
    }
  }

  for (const row of declineRows ?? []) {
    if (!row || typeof row !== "object" || !("cleaner_id" in row)) continue;
    const cid = String((row as { cleaner_id?: string }).cleaner_id ?? "");
    if (!cid) continue;
    declineByCleaner.set(cid, (declineByCleaner.get(cid) ?? 0) + 1);
  }

  const fatigueByCleaner = new Map<string, number>();
  for (const row of offerFatigueRows ?? []) {
    if (!row || typeof row !== "object" || !("cleaner_id" in row)) continue;
    const cid = String((row as { cleaner_id?: string }).cleaner_id ?? "");
    if (!cid) continue;
    fatigueByCleaner.set(cid, (fatigueByCleaner.get(cid) ?? 0) + 1);
  }

  const jobsLast7ByCleaner = new Map<string, number>();
  for (const row of weekRows ?? []) {
    if (!row || typeof row !== "object" || !("cleaner_id" in row)) continue;
    const cid = String((row as { cleaner_id?: string }).cleaner_id ?? "");
    if (!cid) continue;
    jobsLast7ByCleaner.set(cid, (jobsLast7ByCleaner.get(cid) ?? 0) + 1);
  }

  const dayByCleaner = new Map<string, DayInterval[]>();
  const locIdsNeeded = new Set<string>();
  locIdsNeeded.add(locationId);

  for (const row of dayRows ?? []) {
    if (!row || typeof row !== "object") continue;
    const cid = String((row as { cleaner_id?: string }).cleaner_id ?? "");
    const t = String((row as { time?: string }).time ?? "");
    const lid = (row as { location_id?: string | null }).location_id ?? null;
    const dur = (row as { duration_minutes?: number | null }).duration_minutes;
    if (!cid || !t) continue;
    const core = intervalFromRow(t, dur);
    if (!core) continue;
    const iv: DayInterval = { ...core, location_id: lid };
    if (lid) locIdsNeeded.add(lid);
    const list = dayByCleaner.get(cid) ?? [];
    list.push(iv);
    dayByCleaner.set(cid, list);
  }

  const { data: locRows } = await supabase
    .from("locations")
    .select("id, latitude, longitude")
    .in("id", [...locIdsNeeded]);

  const locCoords = new Map<string, LocCoords>();
  for (const lr of locRows ?? []) {
    if (!lr || typeof lr !== "object") continue;
    const id = String((lr as { id?: string }).id ?? "");
    const la = (lr as { latitude?: number | null }).latitude;
    const lo = (lr as { longitude?: number | null }).longitude;
    if (!id || la == null || lo == null || !Number.isFinite(la) || !Number.isFinite(lo)) continue;
    locCoords.set(id, { lat: la, lon: lo });
  }

  const newIvBase = intervalFromRow(timeHm, newJobDuration);
  if (!newIvBase) return emptyFindSmartDispatchCandidates();
  const newIv: DayInterval = { ...newIvBase, location_id: locationId };

  const clusterAffinityCounts = new Map<string, number>();
  const hmNorm = normalizeHm(timeHm);
  const hh = hmNorm.slice(0, 2);
  if (ids.length && locationId && /^\d{2}$/.test(hh)) {
    const { data: affRows } = await supabase
      .from("bookings")
      .select("cleaner_id")
      .eq("date", dateYmd)
      .eq("location_id", locationId)
      .like("time", `${hh}:%`)
      .in("status", ["assigned", "in_progress"])
      .in("cleaner_id", ids);
    for (const row of affRows ?? []) {
      const cid = String((row as { cleaner_id?: string }).cleaner_id ?? "");
      if (!cid) continue;
      clusterAffinityCounts.set(cid, (clusterAffinityCounts.get(cid) ?? 0) + 1);
    }
  }

  const stricter = supplyRatioStricter;
  const scored: SmartDispatchCandidate[] = [];
  const rankingV1MetricsEnv = process.env.DISPATCH_RANKING_V1_METRICS === "true";
  const sampleRaw = process.env.DISPATCH_RANKING_V1_METRICS_SAMPLE?.trim();
  const sampleRateN =
    sampleRaw != null && sampleRaw !== "" && Number.isFinite(Number(sampleRaw)) ? Number(sampleRaw) : 1;
  const sampleClamped = Math.min(1, Math.max(0, sampleRateN));
  const rankingV1MetricsFlush =
    rankingV1MetricsEnv && (sampleClamped >= 1 || Math.random() < sampleClamped);
  const rankingV1MetricsRows: DispatchRankingV1MetricPending[] = [];
  const aiFlags = getAiAutonomyFlags();
  const aiW =
    aiFlags.assignment &&
    options?.aiAssignmentVariant === "variant" &&
    options?.aiAssignmentWeights
      ? options.aiAssignmentWeights
      : null;
  const telemetryBookingId = String(options?.intelligenceTelemetry?.bookingId ?? "").trim() || "unknown";

  for (const c of baseCleaners) {
    const cc = cleanerCoords(c);
    if (!cc) continue;

    const distanceKm = haversineDistanceKm(cc.lat, cc.lon, jobLat, jobLon);

    const existing = (dayByCleaner.get(c.id) ?? []).slice().sort((a, b) => a.start - b.start);
    const fallback: LocCoords = cc;

    const travelOk = await passesTravelAndOverlapAsync({
      supabase,
      existing,
      newIv,
      newLocationId: locationId,
      locCoords,
      fallback,
      innerTravel,
    });
    if (!travelOk) {
      await logSystemEvent({
        level: "info",
        source: "dispatch_filter_debug",
        message: "Cleaner excluded from dispatch scoring",
        context: {
          cleanerId: c.id,
          passesCity: cityId ? String(c.city_id ?? "") === cityId : true,
          passesAvailability: true,
          passesService: true,
          distance: Math.round(distanceKm * 100) / 100,
          included: false,
          reason: "travel_or_overlap",
        },
      });
      continue;
    }

    const prefRow = prefByCleaner.get(c.id);
    if (prefRow && cleanerPreferenceStrictExcludesJob(prefRow, jobPrefCtx)) {
      await logSystemEvent({
        level: "info",
        source: "dispatch_filter_debug",
        message: "Cleaner excluded from dispatch scoring",
        context: {
          cleanerId: c.id,
          included: false,
          reason: "cleaner_preferences_strict",
        },
      });
      continue;
    }

    const jobs7 = jobsLast7ByCleaner.get(c.id) ?? 0;
    const acceptanceLife = Number((c as { acceptance_rate?: number | null }).acceptance_rate ?? 1);
    const acceptanceRec = Number((c as { acceptance_rate_recent?: number | null }).acceptance_rate_recent ?? 1);
    const avgResp = (c as { avg_response_time_ms?: number | null }).avg_response_time_ms ?? null;
    const fatigue = fatigueByCleaner.get(c.id) ?? 0;
    const tier = (c as { tier?: string | null }).tier ?? "bronze";

    const travelMin = await getTravelMinutesBetweenAreas({
      supabase,
      originLocationId: (c.location_id as string | null | undefined) ?? null,
      destLocationId: locationId,
      origin: { lat: cc.lat, lng: cc.lon },
      destination: { lat: jobLat, lng: jobLon },
      inner: innerTravel,
    });

    const nearbyJobDistancesKm = existing
      .map((iv) => {
        if (!iv.location_id) return null;
        const lc = locCoords.get(iv.location_id);
        if (!lc) return null;
        return getDistanceKm({ lat: lc.lat, lng: lc.lon }, { lat: jobLat as number, lng: jobLon as number });
      })
      .filter((v): v is number => v != null);
    const nearbyWorkBoost =
      nearbyJobDistancesKm.length > 0 ? Math.max(0, 1.8 - Math.min(...nearbyJobDistancesKm) * 0.45) : 0;

    const priorityScore = Number((c as { priority_score?: number | null }).priority_score ?? 0) || 0;
    const forcedCleanerBoost = c.id === FORCED_PRIORITY_CLEANER_ID ? 1000 : 0;
    const declines = declineByCleaner.get(c.id) ?? 0;
    const slotHour = parseInt(normalizeHm(timeHm).slice(0, 2), 10);
    const acceptP = predictAcceptanceProbability({
      distanceKm,
      acceptanceRecent: acceptanceRec,
      acceptanceLifetime: acceptanceLife,
      recentDeclines: declines,
      fatigueOffersLastHour: fatigue,
      hourOfDay: Number.isFinite(slotHour) ? slotHour : 12,
    });
    const ema = (c as { marketplace_outcome_ema?: number | null }).marketplace_outcome_ema;
    const learnBoost = (Number(ema ?? 0.5) - 0.5) * 3.5;
    const cn = clusterAffinityCounts.get(c.id) ?? 0;
    const clusterBoost = cn <= 0 ? 0 : Math.min(2.2, 0.85 + cn * 0.4);
    const perf01 = perfByCleaner.get(c.id) ?? 0.5;
    const win = rankingByCleaner.get(c.id)!;
    const accBlend = (acceptanceLife + acceptanceRec) / 2;
    const responsePenalty01 = responsePenalty01FromAvgMs(avgResp);
    const v1Bundle = computeCleanerRankingV1Bundle({
      acceptanceRate: accBlend,
      completionRate: win.completionRate,
      cancellationRate: win.cancellationRate,
      responsePenalty01,
      recency01: win.recency01,
    });
    const v1RankingAdjustment = rankingV1DispatchAdjustment(v1Bundle);
    let score =
      computeDispatchScoreV4(
      {
        rating: c.rating ?? 0,
        totalJobs: c.jobs_completed ?? 0,
        jobsLast7Days: jobs7,
        distanceKm,
        acceptanceLifetime: acceptanceLife,
        acceptanceRecent: acceptanceRec,
        avgResponseTimeMs: avgResp,
        fatigueOffersLastHour: fatigue,
        tier,
        demandLevel,
        surgeMultiplier,
        supplyRatioStricter: stricter,
        randomJitter: rand(),
      },
      { distanceKm, travelMinutes: travelMin },
      ) +
      nearbyWorkBoost +
      priorityScore +
      forcedCleanerBoost +
      acceptP * 2.4 +
      learnBoost +
      clusterBoost;

    score += (perf01 - 0.5) * 6;
    const reviewCountForRank = Math.max(0, Number((c as { review_count?: number | null }).review_count ?? 0));
    score += Math.log1p(reviewCountForRank) * 0.05;
    const lastRevMs = lastReviewAtByCleaner.get(c.id);
    if (lastRevMs != null && Number.isFinite(lastRevMs)) {
      const daysSince = (Date.now() - lastRevMs) / (24 * 60 * 60 * 1000);
      score += Math.exp(-Math.min(Math.max(daysSince, 0), 730) / 100) * 0.06;
    }
    const cleanerRatingRow = Number((c as { rating?: number | null }).rating ?? 5);
    if (cleanerRatingRow < 3.5 && reviewCountForRank >= 5) {
      score -= 0.12;
    }
    if (Boolean((c as { needs_quality_review?: boolean | null }).needs_quality_review)) {
      score -= 0.22;
    }
    const scoreBeforeRankingV1 = score;
    score += v1RankingAdjustment;

    if (aiW) {
      const workloadToday = (dayByCleaner.get(c.id) ?? []).length;
      const bookingCtx = {
        bookingId: telemetryBookingId,
        dateYmd,
        timeHm: normalizeHm(timeHm),
        hourOfDay: Number.isFinite(slotHour) ? slotHour : 12,
      };
      const mi = scoreCleanerForBooking(
        {
          id: c.id,
          distanceKm,
          rating: c.rating ?? 0,
          acceptanceRate: (acceptanceLife + acceptanceRec) / 2,
          recentDeclines: declines,
          lastAssignmentAt: null,
          workloadToday,
        },
        bookingCtx,
      );
      const acc = predictCleanerAcceptanceSync(
        {
          cleaner: {
            id: c.id,
            distanceKm,
            acceptanceRecent: acceptanceRec,
            acceptanceLifetime: acceptanceLife,
            recentDeclines: declines,
            fatigueOffersLastHour: fatigue,
            outcomeEma: (c as { marketplace_outcome_ema?: number | null }).marketplace_outcome_ema,
          },
          booking: bookingCtx,
        },
        aiW,
      );
      score += computeAiDispatchDelta(mi.score, acc, aiW);
    }

    if (prefRow && hasConfiguredPreferences(prefRow)) {
      score += 0.25 * computePreferenceScore01(prefRow, jobPrefCtx);
    }

    if (rankingV1MetricsFlush) {
      rankingV1MetricsRows.push({
        cleaner_id: c.id,
        booking_id: telemetryBookingId,
        date_ymd: dateYmd,
        score_before_ranking_v1: scoreBeforeRankingV1,
        v1_bundle: v1Bundle,
        v1_ranking_adjustment: v1RankingAdjustment,
        final_dispatch_score: score,
        acceptance_rate_blend: accBlend,
        completion_rate_window: win.completionRate,
        cleaner_cancellation_rate_window: win.cancellationRate,
        response_penalty_01: responsePenalty01,
        recency_01: win.recency01,
        distance_km: Math.round(distanceKm * 1000) / 1000,
      });
    }

    if (shouldLogDispatchFilterDebug(true)) {
      await logSystemEvent({
        level: "info",
        source: "dispatch_filter_debug",
        message: "Cleaner evaluated for dispatch scoring",
        context: {
          cleanerId: c.id,
          passesCity: cityId ? String(c.city_id ?? "") === cityId : true,
          passesService: true,
          passesAvailability: true,
          distance: Math.round(distanceKm * 100) / 100,
          included: true,
          priorityScore,
          forcedCleanerBoost,
        },
      });
    }

    scored.push({
      ...c,
      score,
      distance_km: distanceKm,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const out = scored.slice(0, maxCandidates);

  const rankingV1MetricRows: DispatchRankingV1MetricRow[] = [];
  if (rankingV1MetricsFlush && rankingV1MetricsRows.length > 0) {
    const primaryId = scored[0]?.id ?? null;
    for (const row of rankingV1MetricsRows) {
      const rank = scored.findIndex((s) => s.id === row.cleaner_id) + 1;
      const isPrimary = Boolean(primaryId && row.cleaner_id === primaryId);
      rankingV1MetricRows.push({
        ...row,
        dispatch_rank_by_score: rank,
        rank_position: rank,
        in_dispatch_slice: rank > 0 && rank <= maxCandidates,
        is_primary_candidate: isPrimary,
      });
    }
  }

  if (options?.intelligenceTelemetry?.bookingId && out.length) {
    const bookingCtx = {
      bookingId: options.intelligenceTelemetry.bookingId,
      dateYmd,
      timeHm: normalizeHm(timeHm),
    };
    const evaluations = out.slice(0, 8).map((c) => {
      const workloadToday = (dayByCleaner.get(c.id) ?? []).length;
      const accBlend =
        (Number((c as { acceptance_rate?: number | null }).acceptance_rate ?? 1) +
          Number((c as { acceptance_rate_recent?: number | null }).acceptance_rate_recent ?? 1)) /
        2;
      const mi = scoreCleanerForBooking(
        {
          id: c.id,
          distanceKm: c.distance_km,
          rating: c.rating ?? 0,
          acceptanceRate: accBlend,
          recentDeclines: declineByCleaner.get(c.id) ?? 0,
          lastAssignmentAt: null,
          workloadToday,
        },
        bookingCtx,
      );
      return { cleanerId: c.id, dispatchScore: c.score, score: mi.score, breakdown: mi.breakdown };
    });
    void logSystemEvent({
      level: "info",
      source: "cleaner_scored",
      message: "Marketplace intelligence: scored cleaners for booking",
      context: {
        bookingId: options.intelligenceTelemetry.bookingId,
        dateYmd,
        locationId,
        evaluations,
      },
    });
  }

  return { candidates: out, rankingV1MetricRows };
}

async function fetchDispatchWaveMetrics(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<{ offers_for_booking: number; time_to_assign_ms: number | null }> {
  const [{ count }, { data: row }] = await Promise.all([
    supabase.from("dispatch_offers").select("id", { count: "exact", head: true }).eq("booking_id", bookingId),
    supabase.from("bookings").select("created_at, assigned_at").eq("id", bookingId).maybeSingle(),
  ]);
  const r = row as { created_at?: string; assigned_at?: string | null } | null;
  let time_to_assign_ms: number | null = null;
  if (r?.created_at && r?.assigned_at) {
    const a = new Date(r.assigned_at).getTime();
    const c = new Date(r.created_at).getTime();
    if (Number.isFinite(a) && Number.isFinite(c)) time_to_assign_ms = Math.max(0, a - c);
  }
  return { offers_for_booking: count ?? 0, time_to_assign_ms };
}

async function readAssignedCleanerScore(supabase: SupabaseClient, cleanerId: string): Promise<number> {
  const { data: row } = await supabase
    .from("cleaners")
    .select("rating, jobs_completed, acceptance_rate, acceptance_rate_recent, avg_response_time_ms, tier")
    .eq("id", cleanerId)
    .maybeSingle();
  const r = row && typeof row === "object" ? Number((row as { rating?: number }).rating ?? 0) : 0;
  const j = row && typeof row === "object" ? Number((row as { jobs_completed?: number }).jobs_completed ?? 0) : 0;
  const acc = row && typeof row === "object" ? Number((row as { acceptance_rate?: number }).acceptance_rate ?? 1) : 1;
  const accR = row && typeof row === "object" ? Number((row as { acceptance_rate_recent?: number }).acceptance_rate_recent ?? 1) : 1;
  const avg = row && typeof row === "object" ? ((row as { avg_response_time_ms?: number | null }).avg_response_time_ms ?? null) : null;
  const tier = row && typeof row === "object" ? ((row as { tier?: string | null }).tier ?? "bronze") : "bronze";
  return computeDispatchScoreV4({
    rating: r,
    totalJobs: j,
    jobsLast7Days: 0,
    distanceKm: 0,
    acceptanceLifetime: acc,
    acceptanceRecent: accR,
    avgResponseTimeMs: avg,
    fatigueOffersLastHour: 0,
    tier,
    demandLevel: "normal",
    surgeMultiplier: 1,
    supplyRatioStricter: false,
    randomJitter: Math.random(),
  });
}

function hoursUntilBookingStartUtc(dateYmd: string, timeHm: string): number | null {
  const iso = `${dateYmd}T${normalizeHm(timeHm)}:00.000Z`;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return (t - Date.now()) / 3_600_000;
}

function resolveParallelCount(params: {
  supplyRatio: number;
  demandLevel: DemandLevel;
  retryTier: number;
  surgeMultiplier?: number;
  /** Hours until job start (negative = past). */
  hoursUntilJob?: number | null;
  /** 0–1 recent acceptance proxy for the candidate pool (Phase 8E). */
  areaAcceptBlend?: number | null;
}): number {
  let n = 2;
  if (params.supplyRatio < 1 || params.demandLevel === "peak") n = 3;
  if (params.supplyRatio > 3) n = 2;
  if (params.retryTier >= 2) n = Math.min(MAX_PARALLEL_OFFERS, n + 1);
  if (params.supplyRatio > 3) n = Math.min(n, 2);

  const hu = params.hoursUntilJob;
  if (hu != null && Number.isFinite(hu)) {
    if (hu <= 1 && hu > -0.25) n += 2;
    else if (hu <= 3 && hu > -0.25) n += 1;
  }

  const acc = params.areaAcceptBlend;
  if (acc != null && Number.isFinite(acc) && acc < 0.45 && params.supplyRatio < 2) {
    n += 1;
  }

  const cap = (params.surgeMultiplier ?? 1) > 1.5 ? MAX_PARALLEL_OFFERS_PEAK : MAX_PARALLEL_OFFERS;
  return Math.min(cap, Math.max(1, n));
}

export async function smartAssignCleaner(
  supabase: SupabaseClient,
  params: AssignParams,
  options?: SmartAssignOptions,
): Promise<SmartAssignResult> {
  const travelProvider = options?.travelProvider ?? getDefaultTravelTimeProvider();
  const mode = options?.assignmentMode ?? defaultAssignmentMode();
  const offerTimeoutMs = options?.offerTimeoutMs ?? DEFAULT_OFFER_TIMEOUT_MS;
  const maxSoftOffers = options?.maxSoftOffers ?? DEFAULT_MAX_SOFT_OFFERS;
  const maxCandidates = options?.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  const retryTier = options?.retryTier ?? 0;
  await supabase.from("bookings").update({ dispatch_status: "searching" }).eq("id", params.bookingId);

  let searchExpansion = options?.searchExpansion ?? "none";

  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .select(
      "id, date, time, status, cleaner_id, location_id, city_id, duration_minutes, surge_multiplier, demand_level, dispatch_attempt_count, total_paid_zar, service_slug, service",
    )
    .eq("id", params.bookingId)
    .maybeSingle();

  if (bErr || !booking) {
    return { ok: false, error: "db_error", message: bErr?.message };
  }

  const st = String((booking as { status?: string }).status ?? "").toLowerCase();
  if (st !== "pending") {
    return { ok: false, error: "booking_not_pending" };
  }
  if ((booking as { cleaner_id?: string | null }).cleaner_id) {
    return { ok: false, error: "booking_not_pending", message: "Already assigned" };
  }

  const dateYmd = String((booking as { date?: string }).date ?? "");
  const timeHm = String((booking as { time?: string }).time ?? "");
  const locationId = String((booking as { location_id?: string | null }).location_id ?? "");
  const cityId = String((booking as { city_id?: string | null }).city_id ?? "");
  const jobServiceSlug =
    String((booking as { service_slug?: string | null }).service_slug ?? "").trim().toLowerCase() ||
    String((booking as { service?: string | null }).service ?? "").trim().toLowerCase() ||
    null;
  const durationMinutes = (booking as { duration_minutes?: number | null }).duration_minutes ?? null;
  const surgeMultiplier = Number((booking as { surge_multiplier?: number | null }).surge_multiplier ?? 1) || 1;
  const demandLevelRaw = String((booking as { demand_level?: string | null }).demand_level ?? "normal").toLowerCase();
  const demandLevel: DemandLevel =
    demandLevelRaw === "low" || demandLevelRaw === "peak" ? demandLevelRaw : "normal";

  if (dateYmd !== params.date || normalizeHm(timeHm) !== normalizeHm(params.time) || locationId !== params.locationId) {
    await logSystemEvent({
      level: "warn",
      source: "smartAssignCleaner",
      message: "Assign params out of sync with booking row",
      context: {
        bookingId: params.bookingId,
        expected: { date: dateYmd, time: normalizeHm(timeHm), locationId },
        got: { ...params, time: normalizeHm(params.time) },
      },
    });
    return { ok: false, error: "params_mismatch", message: "Booking data does not match assign params" };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd) || !/^\d{2}:\d{2}$/.test(normalizeHm(timeHm))) {
    return { ok: false, error: "invalid_booking_time", message: "Invalid date/time on booking" };
  }

  const { data: locCheck } = await supabase
    .from("locations")
    .select("latitude, longitude")
    .eq("id", locationId)
    .maybeSingle();
  const la = (locCheck as { latitude?: number | null } | null)?.latitude;
  const lo = (locCheck as { longitude?: number | null } | null)?.longitude;
  if (la == null || lo == null || !Number.isFinite(la) || !Number.isFinite(lo)) {
    await logSystemEvent({
      level: "warn",
      source: "dispatch_failed",
      message: "Booking location has no coordinates",
      context: { bookingId: params.bookingId, locationId, reason: "missing_job_coordinates" },
    });
    await enqueueDispatchRetry(supabase, params.bookingId, "missing_job_coordinates");
    return { ok: false, error: "missing_job_coordinates", message: "Location coordinates required for dispatch v4" };
  }

  let pendingCountQuery = supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("location_id", locationId)
    .eq("status", "pending");
  if (cityId) pendingCountQuery = pendingCountQuery.eq("city_id", cityId);
  const { count: pendingCount, error: pErr } = await pendingCountQuery;

  const pendingJobs = pErr ? 1 : Math.max(1, pendingCount ?? 1);

  if (searchExpansion === "none" && pendingJobs > 0) {
    let availRoughQuery = supabase
      .from("cleaners")
      .select("id", { count: "exact", head: true })
      .eq("location_id", locationId)
      .neq("status", "offline");
    if (cityId) availRoughQuery = availRoughQuery.eq("city_id", cityId);
    const { count: availRough } = await availRoughQuery;
    const ratioRough = (availRough ?? 0) / pendingJobs;
    if (ratioRough < 1) {
      searchExpansion = "city";
    }
  }

  const findOpts = {
    randomFn: options?.randomFn,
    travelProvider,
    maxCandidates,
    excludeCleanerIds: options?.excludeCleanerIds,
    intelligenceTelemetry: { bookingId: params.bookingId },
    aiAssignmentVariant: options?.aiAssignmentVariant,
    aiAssignmentWeights: options?.aiAssignmentWeights,
  };

  let findPack = await findSmartDispatchCandidates(
    supabase,
    {
      dateYmd,
      timeHm: normalizeHm(timeHm),
      locationId: params.locationId,
      cityId: cityId || null,
      jobServiceSlug,
      newJobDurationMinutes: durationMinutes,
      searchExpansion,
      demandLevel,
      surgeMultiplier,
      supplyRatioStricter: false,
      retryTier,
    },
    findOpts,
  );
  let candidates = findPack.candidates;
  let rankingV1MetricRows = findPack.rankingV1MetricRows;

  const { data: priorOffers } = await supabase
    .from("dispatch_offers")
    .select("cleaner_id, status")
    .eq("booking_id", params.bookingId)
    .in("status", ["pending", "rejected", "expired", "accepted"]);
  const alreadyOfferedCleanerIds = new Set(
    (priorOffers ?? [])
      .map((r) => String((r as { cleaner_id?: string }).cleaner_id ?? ""))
      .filter(Boolean),
  );
  candidates = candidates.filter((c) => !alreadyOfferedCleanerIds.has(c.id));
  rankingV1MetricRows = rankingV1MetricRows.filter((r) => candidates.some((c) => c.id === r.cleaner_id));

  const supplyRatio = candidates.length / pendingJobs;
  await logSystemEvent({
    level: "info",
    source: "dispatch_supply_state",
    message: "Dispatch supply snapshot",
    context: {
      bookingId: params.bookingId,
      locationId,
      pending_jobs_in_area: pendingJobs,
      available_cleaners_in_area: candidates.length,
      supply_ratio: Math.round(supplyRatio * 1000) / 1000,
    },
  });
  const stricter = supplyRatio > 3;
  if (stricter && candidates.length > 0) {
    findPack = await findSmartDispatchCandidates(
      supabase,
      {
        dateYmd,
        timeHm: normalizeHm(timeHm),
        locationId: params.locationId,
        cityId: cityId || null,
        jobServiceSlug,
        newJobDurationMinutes: durationMinutes,
        searchExpansion,
        demandLevel,
        surgeMultiplier,
        supplyRatioStricter: true,
        retryTier,
      },
      findOpts,
    );
    candidates = findPack.candidates;
    rankingV1MetricRows = findPack.rankingV1MetricRows.filter((r) => findPack.candidates.some((c) => c.id === r.cleaner_id));
  }

  const hoursUntilJob = hoursUntilBookingStartUtc(dateYmd, normalizeHm(timeHm));
  const acceptSamples = candidates.slice(0, 24);
  const areaAcceptBlend =
    acceptSamples.length > 0
      ? acceptSamples.reduce((sum, c) => {
          const life = Number((c as { acceptance_rate?: number | null }).acceptance_rate ?? 1);
          const rec = Number((c as { acceptance_rate_recent?: number | null }).acceptance_rate_recent ?? 1);
          return sum + (life + rec) / 2;
        }, 0) / acceptSamples.length
      : null;

  let parallelCount = resolveParallelCount({
    supplyRatio,
    demandLevel,
    retryTier,
    surgeMultiplier,
    hoursUntilJob,
    areaAcceptBlend,
  });

  try {
    const q = await getWhatsAppQueueStatusCounts(supabase);
    const qDepth = q.pending + q.processing;
    const th = Number(process.env.WHATSAPP_QUEUE_BACKPRESSURE_THRESHOLD ?? "1000");
    if (Number.isFinite(th) && th > 0 && qDepth > th) {
      const before = parallelCount;
      parallelCount = Math.max(1, Math.floor(parallelCount / 2));
      if (parallelCount < before) {
        await logSystemEvent({
          level: "warn",
          source: "dispatch_wa_queue_backpressure",
          message: "Reduced parallel dispatch offers — WhatsApp queue depth high",
          context: {
            bookingId: params.bookingId,
            queue_depth: qDepth,
            parallel_before: before,
            parallel_after: parallelCount,
          },
        });
      }
    } else if (qDepth > 500) {
      const before = parallelCount;
      parallelCount = Math.max(1, parallelCount - 1);
      if (parallelCount < before) {
        await logSystemEvent({
          level: "info",
          source: "dispatch_wa_queue_backpressure",
          message: "Slightly reduced parallel dispatch offers — WhatsApp queue elevated",
          context: {
            bookingId: params.bookingId,
            queue_depth: qDepth,
            parallel_before: before,
            parallel_after: parallelCount,
          },
        });
      }
    }
  } catch {
    /* non-fatal: assign without queue metrics */
  }

  const ttlSeconds = resolveDispatchOfferAcceptTtlSeconds();
  const raceTimeoutMs = Math.max(offerTimeoutMs, ttlSeconds * 1000 + 12_000);

  if (mode === "instant") {
    const top = candidates[0];
    if (!top) {
      await logSystemEvent({
        level: "warn",
        source: "dispatch_failed",
        message: "No cleaner matched dispatch v4 rules",
        context: {
          bookingId: params.bookingId,
          reason: "no_candidate_v4",
          locationId: params.locationId,
          date: dateYmd,
          time: normalizeHm(timeHm),
        },
      });
      await enqueueDispatchRetry(supabase, params.bookingId, "no_candidate_v4");
      await supabase.from("bookings").update({ dispatch_status: "failed" }).eq("id", params.bookingId);
      flushDispatchRankingV1MetricRows(rankingV1MetricRows, null);
      return { ok: false, error: "no_candidate" };
    }

    const now = new Date().toISOString();
    const assignMeta = await marketplaceBookingPatchOnAssign(supabase, {
      date: dateYmd,
      time: normalizeHm(timeHm),
      location_id: locationId,
      city_id: cityId || null,
    });
    const { error: u1 } = await supabase
      .from("bookings")
      .update({
        cleaner_id: top.id,
        payout_owner_cleaner_id: top.id,
        status: "assigned",
        dispatch_status: "assigned",
        assigned_at: now,
        cleaner_response_status: CLEANER_RESPONSE.PENDING,
        ...assignMeta,
      })
      .eq("id", params.bookingId)
      .eq("status", "pending");

    if (u1) {
      await reportOperationalIssue("error", "smartAssignCleaner", u1.message, { bookingId: params.bookingId });
      flushDispatchRankingV1MetricRows(rankingV1MetricRows, null);
      return { ok: false, error: "db_error", message: u1.message };
    }

    flushDispatchRankingV1MetricRows(rankingV1MetricRows, top.id);

    const waveMetrics = await fetchDispatchWaveMetrics(supabase, params.bookingId);
    await logSystemEvent({
      level: "info",
      source: "dispatch_success",
      message: "Cleaner auto-assigned (dispatch v4 instant)",
      context: {
        bookingId: params.bookingId,
        cleanerId: top.id,
        score: top.score,
        distance_km: top.distance_km,
        parallel_count: 1,
        supply_ratio: Math.round(supplyRatio * 1000) / 1000,
        offers_for_booking: waveMetrics.offers_for_booking,
        time_to_assign_ms: waveMetrics.time_to_assign_ms,
      },
    });

    void notifyCleanerAssignedBooking(supabase, params.bookingId, top.id);

    return { ok: true, cleanerId: top.id, score: top.score };
  }

  const pool = candidates.slice(0, maxSoftOffers);
  if (pool.length === 0) {
    await logSystemEvent({
      level: "warn",
      source: "dispatch_failed",
      message: "No cleaner matched dispatch v4 rules",
      context: {
        bookingId: params.bookingId,
        reason: "no_candidate_v4",
        locationId: params.locationId,
        date: dateYmd,
        time: normalizeHm(timeHm),
      },
    });
    await enqueueDispatchRetry(supabase, params.bookingId, "no_candidate_v4");
    await supabase.from("bookings").update({ dispatch_status: "failed" }).eq("id", params.bookingId);
    flushDispatchRankingV1MetricRows(rankingV1MetricRows, null);
    return { ok: false, error: "no_candidate" };
  }

  const metricAttemptNumber =
    Number((booking as { dispatch_attempt_count?: number | null }).dispatch_attempt_count ?? 0) || 0;

  const useTiered = dispatchTieredWindowsEnabled() && pool.length > 2 && mode === "soft";

  if (useTiered) {
    const { data: b0 } = await supabase.from("bookings").select("cleaner_id, status").eq("id", params.bookingId).maybeSingle();
    if (b0 && String((b0 as { status?: string }).status ?? "").toLowerCase() !== "pending") {
      flushDispatchRankingV1MetricRows(rankingV1MetricRows, null);
      return { ok: false, error: "booking_not_pending", message: "Booking state changed" };
    }
    if (b0 && (b0 as { cleaner_id?: string | null }).cleaner_id) {
      const cid = String((b0 as { cleaner_id: string }).cleaner_id);
      flushDispatchRankingV1MetricRows(rankingV1MetricRows, cid);
      const sc = await readAssignedCleanerScore(supabase, cid);
      return { ok: true, cleanerId: cid, score: sc };
    }

    const since1hIso = new Date(Date.now() - 3600_000).toISOString();
    const { data: fatRows } = await supabase
      .from("dispatch_offers")
      .select("cleaner_id")
      .gte("created_at", since1hIso)
      .in(
        "cleaner_id",
        pool.map((c) => c.id),
      );
    const fatigueMap = new Map<string, number>();
    for (const r of fatRows ?? []) {
      const cid = String((r as { cleaner_id?: string }).cleaner_id ?? "");
      if (!cid) continue;
      fatigueMap.set(cid, (fatigueMap.get(cid) ?? 0) + 1);
    }

    const maxKm = Math.max(
      1,
      ...pool.map((c) => (Number.isFinite(c.distance_km) && c.distance_km >= 0 ? c.distance_km : 0)),
    );
    const jobPayRaw = (booking as { total_paid_zar?: number | null }).total_paid_zar;
    const jobPayZar =
      jobPayRaw != null && Number.isFinite(Number(jobPayRaw)) && Number(jobPayRaw) > 0 ? Number(jobPayRaw) : null;

    const jobFitScores = new Map<string, number>();
    for (const c of pool) {
      const accLife = Number((c as { acceptance_rate?: number | null }).acceptance_rate ?? 1);
      const accRec = Number((c as { acceptance_rate_recent?: number | null }).acceptance_rate_recent ?? 1);
      const reliability01 = (accLife + accRec) / 2;
      const fatigue = fatigueMap.get(c.id) ?? 0;
      const dk = Number.isFinite(c.distance_km) && c.distance_km >= 0 ? c.distance_km : null;
      const s = scoreCleanerForJob(
        {
          distanceKm: dk,
          availabilityOk: true,
          reliability01,
          fatigueOffersLastHour: fatigue,
          jobPayZar: jobPayZar ?? undefined,
          typicalPayZar: undefined,
        },
        maxKm,
      );
      jobFitScores.set(c.id, s);
    }

    const sortedPool = [...pool].sort((a, b) => {
      const sa = jobFitScores.get(a.id) ?? 0;
      const sb = jobFitScores.get(b.id) ?? 0;
      if (sb !== sa) return sb - sa;
      return b.score - a.score;
    });

    const urgentJob =
      hoursUntilJob != null && Number.isFinite(hoursUntilJob) && hoursUntilJob > -0.25 && hoursUntilJob < 2;
    const { tierA, tierB, tierC } = buildDispatchTiers(sortedPool, jobFitScores);
    const tierPlans = planDispatchTierWindows(tierA, tierB, tierC, {
      urgentJob,
      broadcastImmediate: false,
    });

    await logSystemEvent({
      level: "info",
      source: "dispatch_tier_wave_planned",
      message: "Tiered dispatch windows planned",
      context: {
        bookingId: params.bookingId,
        tier_a: tierA.length,
        tier_b: tierB.length,
        tier_c: tierC.length,
        urgent_job: urgentJob,
        pool: pool.length,
      },
    });

    const byId = new Map(sortedPool.map((c) => [c.id, c]));
    const plansJoined = tierPlans
      .map((plan) => {
        const candidate = byId.get(plan.candidateId);
        return candidate ? { candidate, plan } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x != null);

    const tieredWinner = await runTieredParallelDispatchOfferRace({
      supabase,
      bookingId: params.bookingId,
      plans: plansJoined,
      offerTimeoutMs: raceTimeoutMs,
      ttlSeconds,
      metricAttemptNumber,
    });

    if (tieredWinner) {
      const waveMetrics = await fetchDispatchWaveMetrics(supabase, params.bookingId);
      await logSystemEvent({
        level: "info",
        source: "dispatch_success",
        message: "Cleaner assigned via tiered soft dispatch",
        context: {
          bookingId: params.bookingId,
          cleanerId: tieredWinner.cleanerId,
          score: tieredWinner.score,
          distance_km: tieredWinner.distance_km,
          parallel_count: plansJoined.length,
          supply_ratio: Math.round(supplyRatio * 1000) / 1000,
          offers_for_booking: waveMetrics.offers_for_booking,
          time_to_assign_ms: waveMetrics.time_to_assign_ms,
          dispatch_tier: tieredWinner.dispatch_tier ?? null,
        },
      });
      flushDispatchRankingV1MetricRows(rankingV1MetricRows, tieredWinner.cleanerId);
      return { ok: true, cleanerId: tieredWinner.cleanerId, score: tieredWinner.score };
    }

    flushDispatchRankingV1MetricRows(rankingV1MetricRows, null);
    await logSystemEvent({
      level: "warn",
      source: "dispatch_failed",
      message: "Tiered soft dispatch exhausted candidates",
      context: {
        bookingId: params.bookingId,
        reason: "no_candidate_v4_soft_tiered",
        locationId: params.locationId,
        pool: pool.length,
      },
    });
    await enqueueDispatchRetry(supabase, params.bookingId, "no_candidate_v4_soft_tiered");
    await supabase.from("bookings").update({ dispatch_status: "failed" }).eq("id", params.bookingId);
    return { ok: false, error: "no_candidate" };
  }

  let rankOffset = 0;
  for (let offset = 0; offset < pool.length; offset += parallelCount) {
    const batch = pool.slice(offset, offset + parallelCount);
    if (batch.length === 0) break;

    const { data: b0 } = await supabase.from("bookings").select("cleaner_id, status").eq("id", params.bookingId).maybeSingle();
    if (b0 && String((b0 as { status?: string }).status ?? "").toLowerCase() !== "pending") {
      flushDispatchRankingV1MetricRows(rankingV1MetricRows, null);
      return { ok: false, error: "booking_not_pending", message: "Booking state changed" };
    }
    if (b0 && (b0 as { cleaner_id?: string | null }).cleaner_id) {
      const cid = String((b0 as { cleaner_id: string }).cleaner_id);
      flushDispatchRankingV1MetricRows(rankingV1MetricRows, cid);
      const sc = await readAssignedCleanerScore(supabase, cid);
      return { ok: true, cleanerId: cid, score: sc };
    }

    const winner = await runParallelDispatchOfferRace({
      supabase,
      bookingId: params.bookingId,
      batch,
      parallelCount,
      offerTimeoutMs: raceTimeoutMs,
      ttlSeconds,
      rankOffset,
      metricAttemptNumber,
    });
    rankOffset += batch.length;

    if (winner) {
      const waveMetrics = await fetchDispatchWaveMetrics(supabase, params.bookingId);
      await logSystemEvent({
        level: "info",
        source: "dispatch_success",
        message: "Cleaner assigned via parallel soft dispatch",
        context: {
          bookingId: params.bookingId,
          cleanerId: winner.cleanerId,
          score: winner.score,
          distance_km: winner.distance_km,
          parallel_count: Math.min(parallelCount, batch.length),
          supply_ratio: Math.round(supplyRatio * 1000) / 1000,
          offers_for_booking: waveMetrics.offers_for_booking,
          time_to_assign_ms: waveMetrics.time_to_assign_ms,
        },
      });
      flushDispatchRankingV1MetricRows(rankingV1MetricRows, winner.cleanerId);
      return { ok: true, cleanerId: winner.cleanerId, score: winner.score };
    }
  }

  flushDispatchRankingV1MetricRows(rankingV1MetricRows, null);

  await logSystemEvent({
    level: "warn",
    source: "dispatch_failed",
    message: "Parallel soft dispatch exhausted candidates",
    context: {
      bookingId: params.bookingId,
      reason: "no_candidate_v4_soft",
      locationId: params.locationId,
      parallel_count: parallelCount,
    },
  });
  await enqueueDispatchRetry(supabase, params.bookingId, "no_candidate_v4_soft");
  await supabase.from("bookings").update({ dispatch_status: "failed" }).eq("id", params.bookingId);
  return { ok: false, error: "no_candidate" };
}
