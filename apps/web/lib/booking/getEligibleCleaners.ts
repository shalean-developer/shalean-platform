import type { SupabaseClient } from "@supabase/supabase-js";
import { useStrictAvailability } from "@/lib/booking/availabilityFlags";
import type { AvailableCleaner, CleanerAvailabilityRow } from "@/lib/booking/cleanerPoolTypes";
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
  serviceType?: string | null;
  /** When set, only these cleaner ids are considered. */
  cleanerIds?: string[];
  userLat?: number | null;
  userLng?: number | null;
  limit?: number;
  strictAvailability?: boolean;
  /** When set, skips DB fetch for `cleaner_availability` (slot grid optimization). */
  preloadedAvailability?: CleanerAvailabilityRow[];
  /** When set, skips DB fetch for `cleaner_locations`. */
  preloadedCleanerLocations?: CleanerLocationPair[];
  /** When set, skips cleaners list query (must match `cleanerIds` filter intent). */
  preloadedCleaners?: CleanerBase[];
};

const CONFLICT_STATUSES = new Set([
  "pending",
  "pending_payment",
  "assigned",
  "in_progress",
  "confirmed",
]);

export type CleanerBase = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  rating: number | null;
  is_available: boolean | null;
  jobs_completed: number | null;
  review_count?: number | null;
  home_lat?: number | null;
  home_lng?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  location_id?: string | null;
  status?: string | null;
};

function toMinutes(hm: string): number {
  const [h, m] = hm.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function isOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
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

type BookingRow = {
  cleaner_id: string | null;
  status: string | null;
  date?: string | null;
  booking_date?: string | null;
  time?: string | null;
  start_time?: string | null;
  end_time?: string | null;
};

function bookingWindow(row: BookingRow): { start: number; end: number } | null {
  const startRaw = row.start_time ?? row.time ?? null;
  if (!startRaw || !/^\d{2}:\d{2}/.test(startRaw)) return null;
  const start = toMinutes(startRaw);
  const endRaw = row.end_time;
  if (endRaw && /^\d{2}:\d{2}/.test(endRaw)) return { start, end: toMinutes(endRaw) };
  return { start, end: start + 120 };
}

function bookingDate(row: BookingRow): string | null {
  return row.booking_date ?? row.date ?? null;
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
  const strict = params.strictAvailability ?? useStrictAvailability();
  const limit = params.limit ?? 500;
  const slotHm = params.startTime.trim().slice(0, 5);
  const slotStart = hmToMinutes(slotHm);
  if (slotStart == null) return [];
  const slotEnd = slotStart + Math.max(30, Math.round(params.durationMinutes));

  let cleaners: CleanerBase[];
  if (params.preloadedCleaners?.length) {
    cleaners = params.preloadedCleaners.filter((c) => c.is_available !== false && String(c.status ?? "").toLowerCase() !== "offline");
    if (params.cleanerIds?.length) {
      const allow = new Set(params.cleanerIds);
      cleaners = cleaners.filter((c) => allow.has(c.id));
    }
  } else {
    let q = admin
      .from("cleaners")
      .select(
        "id, full_name, phone, email, rating, is_available, jobs_completed, review_count, home_lat, home_lng, latitude, longitude, location_id, status",
      )
      .eq("is_available", true)
      .neq("status", "offline");

    if (params.cleanerIds?.length) {
      q = q.in("id", params.cleanerIds);
    }

    const { data: cleanersRaw, error: cErr } = await q;
    if (cErr || !cleanersRaw?.length) return [];
    cleaners = cleanersRaw as CleanerBase[];
  }

  if (!cleaners.length) return [];
  const ids = cleaners.map((c) => c.id);

  const needAvail = params.preloadedAvailability == null;
  const needLoc = params.preloadedCleanerLocations == null;

  const [availRes, locRes, bookRes] = await Promise.all([
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
      .select("cleaner_id, status, date, booking_date, time, start_time, end_time")
      .in("status", [...CONFLICT_STATUSES])
      .or(`date.eq.${params.date},booking_date.eq.${params.date}`),
  ]);

  const availData = params.preloadedAvailability ?? (availRes as { data: CleanerAvailabilityRow[] | null }).data;
  const locRows = params.preloadedCleanerLocations ?? (locRes as { data: unknown[] | null }).data;
  const bookRows = (bookRes as { data: unknown[] | null }).data;

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

  const bookingsByCleaner = new Map<string, BookingRow[]>();
  for (const row of (bookRows ?? []) as BookingRow[]) {
    if (!row.cleaner_id) continue;
    const arr = bookingsByCleaner.get(row.cleaner_id) ?? [];
    arr.push(row);
    bookingsByCleaner.set(row.cleaner_id, arr);
  }

  const filtered: CleanerBase[] = [];
  for (const c of cleaners) {
    const avail = availabilityByCleaner.get(c.id) ?? [];
    const windows = avail.map((a) => ({
      start_time: String(a.start_time ?? "00:00").slice(0, 5),
      end_time: String(a.end_time ?? "23:59").slice(0, 5),
      is_available: Boolean(a.is_available ?? true),
    }));

    const calendarOk = jobFitsAvailabilityWindows(windows, slotStart, slotEnd, strict);
    if (!calendarOk) continue;

    const allowed = locationsByCleaner.get(c.id) ?? new Set<string>();
    const fallback = c.location_id ? String(c.location_id) : null;
    if (!cleanerAreasAllowJob(allowed, fallback, params.locationExpandedIds)) continue;

    const conflicts = (bookingsByCleaner.get(c.id) ?? []).some((b) => {
      if (bookingDate(b) !== params.date) return false;
      const win = bookingWindow(b);
      if (!win) return false;
      return isOverlap(slotStart, slotEnd, win.start, win.end);
    });
    if (conflicts) continue;

    filtered.push(c);
  }

  const withDistance: AvailableCleaner[] = filtered.map((c) => {
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
      is_available: Boolean(c.is_available),
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
