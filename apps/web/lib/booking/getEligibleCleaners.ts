import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanerWorksOnScheduledWeekday } from "@/lib/cleaner/availabilityWeekdays";
import { isUnknownColumnError } from "@/lib/cleaner/cleanerMeDb";
import { isStrictAvailabilityEnabled } from "@/lib/booking/availabilityFlags";
import {
  buildDailyCleanerWorkloadShadowReport,
  reportDailyCleanerWorkloadShadow,
} from "@/lib/booking/cleanerDailyWorkloadShadow";
import {
  cleanerPassesServiceCapabilityGate,
  serviceCapabilityGateFromBookingFields,
} from "@/lib/booking/serviceCapabilityEligibility";
import type { AvailableCleaner, CleanerAvailabilityRow } from "@/lib/booking/cleanerPoolTypes";
import { BOOKING_SLOT_OCCUPYING_STATUSES } from "@/lib/booking/bookingCleanerSlotOccupyingStatuses";
import type { OccupyingBookingRow } from "@/lib/booking/cleanerSlotEligibility";
import {
  cleanerAccountEligibleForCustomerBooking,
  cleanerHasOccupyingSlotOverlap,
  indexOccupyingBookingsByCleanerId,
} from "@/lib/booking/cleanerSlotEligibility";
import {
  cleanerPreferenceStrictExcludesJob,
  type CleanerPreferenceRowLike,
} from "@/lib/dispatch/cleanerPreferenceMatch";
import { hmToMinutes } from "@/lib/dispatch/timeWindow";

export type CleanerLocationPair = { cleaner_id: string; location_id: string };

export type GetEligibleCleanersParams = {
  date: string;
  /** HH:mm */
  startTime: string;
  durationMinutes: number;
  /** Booking / job location UUID. */
  locationId: string;
  /**
   * `null` = skip location filter (dispatch broadcast).
   * Non-null list: cleaner must have at least one `cleaner_locations.location_id` in this list
   * (after fallback to `cleaners.location_id`).
   */
  locationExpandedIds: string[] | null;
  /** Catalog service slug/id (e.g. `deep`, `move`) for capability gating. */
  serviceType?: string | null;
  /** Display label fallback when slug alone is insufficient (legacy rows). */
  serviceLabelForCapability?: string | null;
  /** When set, only these cleaner ids are considered. */
  cleanerIds?: string[];
  /** When set, this booking is ignored for slot overlap (admin reassign / offer on same row). */
  excludeBookingId?: string | null;
  userLat?: number | null;
  userLng?: number | null;
  limit?: number;
  strictAvailability?: boolean;
  /** When set, skips DB fetch for `cleaner_availability` (slot grid optimization). */
  preloadedAvailability?: CleanerAvailabilityRow[];
  /** When set, skips DB fetch for `cleaner_locations`. */
  preloadedCleanerLocations?: CleanerLocationPair[];
  /** When set, skips DB fetch for `cleaner_preferences` (strict service/time gating). */
  preloadedCleanerPreferences?: Map<string, CleanerPreferenceRowLike>;
  /** When set, skips cleaners list query (must match `cleanerIds` filter intent). */
  preloadedCleaners?: CleanerBase[];
  /**
   * Public rollout only. When true, removes solo cleaners whose day would exceed 8h
   * after this requested booking. Default false so admin/dispatch callers remain unchanged.
   */
  enforcePublicDailyWorkloadLimit?: boolean;
};

export type CleanerBase = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  rating: number | null;
  is_active?: boolean | null;
  is_available: boolean | null;
  jobs_completed: number | null;
  review_count?: number | null;
  home_lat?: number | null;
  home_lng?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  location_id?: string | null;
  status?: string | null;
  availability_weekdays?: string[] | null;
  can_do_deep_cleaning?: boolean | null;
  can_do_move_cleaning?: boolean | null;
};

function toMinutes(hm: string): number {
  const [h, m] = hm.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return Number((R * c).toFixed(2));
}

/** Slot [slotStart, slotEnd] fully inside availability [winStart, winEnd]. */
export function slotFullyInsideWindow(slotStart: number, slotEnd: number, winStart: number, winEnd: number): boolean {
  return slotStart >= winStart && slotEnd <= winEnd;
}

export function jobFitsAvailabilityWindows(
  windows: Array<{ start_time: string; end_time: string; is_available: boolean }>,
  slotStartMin: number,
  slotEndMin: number,
  strictEmpty: boolean,
): boolean {
  const rows = windows.filter((w) => w.is_available);
  if (rows.length === 0) return !strictEmpty;
  return rows.some((a) => {
    const winStart =
      a.start_time && /^\d{2}:\d{2}/.test(a.start_time) ? toMinutes(a.start_time.slice(0, 5)) : null;
    const winEnd = a.end_time && /^\d{2}:\d{2}/.test(a.end_time) ? toMinutes(a.end_time.slice(0, 5)) : null;
    if (winStart == null || winEnd == null) return false;
    return slotFullyInsideWindow(slotStartMin, slotEndMin, winStart, winEnd);
  });
}

export function cleanerAreasAllowJob(
  allowedLocationIds: Set<string>,
  cleanerFallbackLocationId: string | null,
  expandedIds: string[] | null,
): boolean {
  if (expandedIds == null) return true;
  if (expandedIds.length === 0) return false;
  const expanded = new Set(expandedIds.map((x) => String(x).trim()).filter(Boolean));
  if (allowedLocationIds.size === 0 && cleanerFallbackLocationId && expanded.has(cleanerFallbackLocationId)) {
    return true;
  }
  for (const id of allowedLocationIds) {
    if (expanded.has(id)) return true;
  }
  return false;
}

/**
 * Single source of truth for slot pricing, dispatch shortlist, admin assignment gates, and listing APIs.
 */
export async function getEligibleCleaners(
  admin: SupabaseClient,
  params: GetEligibleCleanersParams,
): Promise<AvailableCleaner[]> {
  const strict = params.strictAvailability ?? isStrictAvailabilityEnabled();
  const limit = params.limit ?? 500;
  const capabilityGate = serviceCapabilityGateFromBookingFields(
    params.serviceType,
    params.serviceLabelForCapability,
  );
  const slotHm = params.startTime.trim().slice(0, 5);
  const slotStart = hmToMinutes(slotHm);
  if (slotStart == null) return [];
  const slotEnd = slotStart + Math.max(30, Math.round(params.durationMinutes));

  let cleaners: CleanerBase[];
  if (params.preloadedCleaners?.length) {
    cleaners = params.preloadedCleaners.filter((c) => {
      if (!cleanerAccountEligibleForCustomerBooking(c)) return false;
      if (!cleanerWorksOnScheduledWeekday(c.availability_weekdays, params.date)) return false;
      if (!cleanerPassesServiceCapabilityGate(c, capabilityGate)) return false;
      return true;
    });
    if (params.cleanerIds?.length) {
      const allow = new Set(params.cleanerIds);
      cleaners = cleaners.filter((c) => allow.has(c.id));
    }
  } else {
    const selWithWd =
      "id, full_name, phone, email, rating, is_active, is_available, jobs_completed, review_count, home_lat, home_lng, latitude, longitude, location_id, status, availability_weekdays";
    const selBase =
      "id, full_name, phone, email, rating, is_active, is_available, jobs_completed, review_count, home_lat, home_lng, latitude, longitude, location_id, status";
    const capCols = ", can_do_deep_cleaning, can_do_move_cleaning";

    const stripActiveCol = (s: string) => s.replace(", is_active", "");
    const runWith = async (columns: string, requireActiveEq: boolean) => {
      let q = admin.from("cleaners").select(columns).eq("is_available", true);
      if (requireActiveEq) q = q.eq("is_active", true);
      if (params.cleanerIds?.length) q = q.in("id", params.cleanerIds);
      return q;
    };

    let cleanersRaw: CleanerBase[] | null = null;
    let cErr = null as { message?: string } | null;
    {
      let requireActive = true;
      let wd = selWithWd;
      let base = selBase;
      let r = await runWith(wd + capCols, requireActive);
      if (r.error && isUnknownColumnError(r.error, "is_active")) {
        requireActive = false;
        wd = stripActiveCol(selWithWd);
        base = stripActiveCol(selBase);
        r = await runWith(wd + capCols, false);
      }
      if (
        r.error &&
        (isUnknownColumnError(r.error, "can_do_deep_cleaning") ||
          isUnknownColumnError(r.error, "can_do_move_cleaning"))
      ) {
        r = await runWith(wd, requireActive);
      }
      if (r.error && isUnknownColumnError(r.error, "availability_weekdays")) {
        r = await runWith(base + capCols, requireActive);
        if (
          r.error &&
          (isUnknownColumnError(r.error, "can_do_deep_cleaning") ||
            isUnknownColumnError(r.error, "can_do_move_cleaning"))
        ) {
          r = await runWith(base, requireActive);
        }
      }
      cleanersRaw = (r.data ?? null) as CleanerBase[] | null;
      cErr = r.error;
    }
    if (cErr || !cleanersRaw?.length) return [];
    cleaners = (cleanersRaw as CleanerBase[]).filter((c) => cleanerAccountEligibleForCustomerBooking(c));
    if (!cleaners.length) return [];
  }

  if (!cleaners.length) return [];
  const ids = cleaners.map((c) => c.id);

  const needAvail = params.preloadedAvailability == null;
  const needLoc = params.preloadedCleanerLocations == null;
  const jobServiceSlug = (params.serviceType ?? "").trim().toLowerCase() || null;
  const needPrefs = params.preloadedCleanerPreferences == null && jobServiceSlug != null;

  const [availRes, locRes, bookRes, prefRes] = await Promise.all([
    needAvail
      ? admin
          .from("cleaner_availability")
          .select("cleaner_id, date, start_time, end_time, is_available")
          .eq("date", params.date)
          .in("cleaner_id", ids)
      : Promise.resolve({ data: null as CleanerAvailabilityRow[] | null, error: null }),
    needLoc
      ? admin.from("cleaner_locations").select("cleaner_id, location_id").in("cleaner_id", ids)
      : Promise.resolve({ data: null as { cleaner_id: string; location_id: string }[] | null, error: null }),
    admin
      .from("bookings")
      .select(
        "id, cleaner_id, selected_cleaner_id, payout_owner_cleaner_id, team_id, is_team_job, status, date, booking_date, time, start_time, end_time, duration_minutes",
      )
      .in("status", [...BOOKING_SLOT_OCCUPYING_STATUSES])
      .or(`date.eq.${params.date},booking_date.eq.${params.date}`),
    needPrefs
      ? admin
          .from("cleaner_preferences")
          .select("cleaner_id, preferred_areas, preferred_services, preferred_time_blocks, is_strict")
          .in("cleaner_id", ids)
      : Promise.resolve({ data: null as Record<string, unknown>[] | null, error: null }),
  ]);

  const availData = params.preloadedAvailability ?? (availRes as { data: CleanerAvailabilityRow[] | null }).data;
  const locRows = params.preloadedCleanerLocations ?? (locRes as { data: unknown[] | null }).data;
  const bookRows = (bookRes as { data: unknown[] | null }).data;

  const prefByCleaner =
    params.preloadedCleanerPreferences ??
    (() => {
      const m = new Map<string, CleanerPreferenceRowLike>();
      if (!needPrefs) return m;
      for (const raw of (prefRes as { data: Record<string, unknown>[] | null }).data ?? []) {
        const cid = String((raw as { cleaner_id?: string }).cleaner_id ?? "");
        if (cid) m.set(cid, raw as CleanerPreferenceRowLike);
      }
      return m;
    })();

  const jobPrefCtx =
    jobServiceSlug != null
      ? {
          jobLocationId: params.locationId,
          jobServiceSlug,
          jobDateYmd: params.date,
          jobTimeHm: slotHm,
        }
      : null;

  const availabilityByCleaner = new Map<string, CleanerAvailabilityRow[]>();
  for (const row of (availData ?? []) as CleanerAvailabilityRow[]) {
    if (row.date != null && row.date !== params.date) continue;
    const cid = String(row.cleaner_id ?? "");
    if (!cid) continue;
    const arr = availabilityByCleaner.get(cid) ?? [];
    arr.push(row);
    availabilityByCleaner.set(cid, arr);
  }

  const locationsByCleaner = new Map<string, Set<string>>();
  for (const raw of locRows ?? []) {
    const r = raw as { cleaner_id?: string; location_id?: string };
    const cid = String(r.cleaner_id ?? "");
    const lid = String(r.location_id ?? "").trim();
    if (!cid || !lid) continue;
    const s = locationsByCleaner.get(cid) ?? new Set();
    s.add(lid);
    locationsByCleaner.set(cid, s);
  }

  const occupyingByCleaner = indexOccupyingBookingsByCleanerId((bookRows ?? []) as OccupyingBookingRow[]);

  const trace = process.env.BOOKING_CLEANERS_TRACE === "1";
  const drop = { weekday: 0, calendar: 0, area: 0, conflict: 0, capability: 0, preference: 0, dailyWorkload: 0 };

  const filtered: CleanerBase[] = [];
  for (const c of cleaners) {
    if (!cleanerWorksOnScheduledWeekday(c.availability_weekdays, params.date)) {
      if (trace) drop.weekday++;
      continue;
    }

    const avail = availabilityByCleaner.get(c.id) ?? [];
    const windows = avail.map((a) => ({
      start_time: String(a.start_time ?? "00:00").slice(0, 5),
      end_time: String(a.end_time ?? "23:59").slice(0, 5),
      is_available: Boolean(a.is_available ?? true),
    }));

    const calendarOk = jobFitsAvailabilityWindows(windows, slotStart, slotEnd, strict);
    if (!calendarOk) {
      if (trace) drop.calendar++;
      continue;
    }

    const allowed = locationsByCleaner.get(c.id) ?? new Set<string>();
    const fallback = c.location_id ? String(c.location_id) : null;
    if (!cleanerAreasAllowJob(allowed, fallback, params.locationExpandedIds)) {
      if (trace) drop.area++;
      continue;
    }

    if (cleanerHasOccupyingSlotOverlap(occupyingByCleaner, c.id, params.date, slotStart, slotEnd, params.excludeBookingId ?? null)) {
      if (trace) drop.conflict++;
      continue;
    }

    if (!cleanerPassesServiceCapabilityGate(c, capabilityGate)) {
      if (trace) drop.capability++;
      continue;
    }

    if (jobPrefCtx) {
      const prefRow = prefByCleaner.get(c.id);
      if (prefRow && cleanerPreferenceStrictExcludesJob(prefRow, jobPrefCtx)) {
        if (trace) drop.preference++;
        continue;
      }
    }

    filtered.push(c);
  }

  let publicWorkloadFiltered = filtered;
  if (params.enforcePublicDailyWorkloadLimit === true && filtered.length > 0) {
    const requestedDurationMinutes = Math.max(30, Math.round(params.durationMinutes));
    const report = buildDailyCleanerWorkloadShadowReport([
      ...((bookRows ?? []) as Array<{
        id?: string | null;
        cleaner_id?: string | null;
        payout_owner_cleaner_id?: string | null;
        team_id?: string | null;
        is_team_job?: boolean | null;
        date?: string | null;
        booking_date?: string | null;
        status?: string | null;
        duration_minutes?: number | null;
      }>),
      ...filtered.map((c) => ({
        id: `public-request:${c.id}`,
        cleaner_id: c.id,
        date: params.date,
        duration_minutes: requestedDurationMinutes,
        is_team_job: false,
      })),
    ]);
    reportDailyCleanerWorkloadShadow(report, { source: "getEligibleCleaners.public" });
    const overLimitSoloCleanerIds = new Set(
      report.soloDays
        .filter((day) => day.dateYmd === params.date && day.riskBand === "over_8h")
        .map((day) => day.cleanerId),
    );
    publicWorkloadFiltered = filtered.filter((c) => !overLimitSoloCleanerIds.has(c.id));
    drop.dailyWorkload = filtered.length - publicWorkloadFiltered.length;
  }

  if (trace) {
    console.log(
      "[BOOKING CLEANERS TRACE]",
      JSON.stringify({
        date: params.date,
        startTime: params.startTime,
        durationMinutes: params.durationMinutes,
        locationId: params.locationId,
        locationExpandedIds: params.locationExpandedIds,
        bookingServiceSlug: params.serviceType ?? null,
        strict,
        poolSize: cleaners.length,
        availabilityRowsForDate: (availData ?? []).length,
        cleanerLocationsRowsLoaded: (locRows ?? []).length,
        occupyingBookingsForDate: (bookRows ?? []).length,
        dropCounts: drop,
        finalEligible: publicWorkloadFiltered.length,
      }),
    );
  }

  const withDistance: AvailableCleaner[] = publicWorkloadFiltered.map((c) => {
    const lat = c.latitude ?? c.home_lat ?? null;
    const lng = c.longitude ?? c.home_lng ?? null;
    const canCalc =
      typeof params.userLat === "number" &&
      typeof params.userLng === "number" &&
      typeof lat === "number" &&
      typeof lng === "number";
    return {
      id: c.id,
      full_name: c.full_name ?? "Cleaner",
      phone: c.phone ?? null,
      email: c.email ?? null,
      rating: Number(c.rating ?? 5),
      is_available: true,
      slot_eligible: true as const,
      jobs_completed: Number(c.jobs_completed ?? 0),
      review_count: Math.max(0, Math.round(Number(c.review_count ?? 0))),
      recent_reviews: [],
      distance_km: canCalc ? haversineKm(params.userLat!, params.userLng!, lat!, lng!) : null,
      base_lat: lat,
      base_lng: lng,
    };
  });

  withDistance.sort((a, b) => {
    const distA = a.distance_km ?? Number.POSITIVE_INFINITY;
    const distB = b.distance_km ?? Number.POSITIVE_INFINITY;
    if (distA !== distB) return distA - distB;
    if (a.rating !== b.rating) return b.rating - a.rating;
    return b.jobs_completed - a.jobs_completed;
  });

  return withDistance.slice(0, limit);
}

export async function countEligibleCleaners(
  admin: SupabaseClient,
  params: Omit<GetEligibleCleanersParams, "limit" | "userLat" | "userLng" | "preloadedCleaners" | "preloadedAvailability" | "preloadedCleanerLocations">,
): Promise<number> {
  const rows = await getEligibleCleaners(admin, { ...params, limit: 10_000 });
  return rows.length;
}
