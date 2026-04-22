import type { SupabaseClient } from "@supabase/supabase-js";
import { haversineDistanceKm } from "@/lib/dispatch/distance";

export type LatLngPoint = {
  lat: number;
  lng: number;
};

export type ScheduleBooking = {
  id: string;
  service: string | null;
  date: string;
  time: string;
  durationMinutes: number;
  locationLabel: string | null;
  locationId: string | null;
  lat: number | null;
  lng: number | null;
  status: string | null;
};

export type CleanerRouteStop = ScheduleBooking & {
  sequence: number;
  travelKmFromPrev: number;
  travelMinutesFromPrev: number;
  startsAtMinutes: number;
  endsAtMinutes: number;
};

export type CleanerSchedule = {
  cleanerId: string;
  date: string;
  jobs: CleanerRouteStop[];
  metrics: {
    jobsCount: number;
    totalTravelKm: number;
    totalTravelMinutes: number;
    travelTimeSavedMinutes: number;
    jobsPerCleanerPerDay: number;
  };
};

const DEFAULT_DURATION_MIN = 180;
const DEFAULT_TRAVEL_BUFFER_MIN = 25;
const CLUSTER_RADIUS_KM = 4;

export function getDistanceKm(a: LatLngPoint, b: LatLngPoint): number {
  return haversineDistanceKm(a.lat, a.lng, b.lat, b.lng);
}

function hmToMinutes(hm: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hm).trim());
  if (!m) return NaN;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return NaN;
  return h * 60 + mm;
}

function normalizeBooking(row: {
  id?: string;
  service?: string | null;
  date?: string | null;
  time?: string | null;
  duration_minutes?: number | null;
  location?: string | null;
  location_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status?: string | null;
}): ScheduleBooking | null {
  const id = String(row.id ?? "");
  const date = String(row.date ?? "");
  const time = String(row.time ?? "");
  if (!id || !date || !time) return null;
  return {
    id,
    service: row.service ?? null,
    date,
    time,
    durationMinutes: Number(row.duration_minutes ?? DEFAULT_DURATION_MIN) || DEFAULT_DURATION_MIN,
    locationLabel: row.location ?? null,
    locationId: row.location_id ?? null,
    lat: row.latitude ?? null,
    lng: row.longitude ?? null,
    status: row.status ?? null,
  };
}

export function clusterBookingsByAreaAndWindow(bookings: ScheduleBooking[]): ScheduleBooking[][] {
  const sorted = [...bookings].sort((a, b) => hmToMinutes(a.time) - hmToMinutes(b.time));
  const clusters: ScheduleBooking[][] = [];
  for (const booking of sorted) {
    const minutes = hmToMinutes(booking.time);
    let placed = false;
    for (const cluster of clusters) {
      const anchor = cluster[0];
      const anchorMinutes = hmToMinutes(anchor.time);
      const sameWindow = Math.abs(minutes - anchorMinutes) <= 90;
      const hasCoords = anchor.lat != null && anchor.lng != null && booking.lat != null && booking.lng != null;
      const nearEnough = hasCoords
        ? getDistanceKm(
            { lat: anchor.lat as number, lng: anchor.lng as number },
            { lat: booking.lat as number, lng: booking.lng as number },
          ) <= CLUSTER_RADIUS_KM
        : anchor.locationId != null && anchor.locationId === booking.locationId;
      if (sameWindow && nearEnough) {
        cluster.push(booking);
        placed = true;
        break;
      }
    }
    if (!placed) {
      clusters.push([booking]);
    }
  }
  return clusters;
}

function estimateTravelMinutes(distanceKm: number): number {
  const avgUrbanSpeedKmh = 30;
  return Math.max(5, Math.round((distanceKm / avgUrbanSpeedKmh) * 60));
}

type BuildScheduleParams = {
  cleanerId: string;
  date: string;
  travelBufferMin?: number;
};

export async function buildCleanerSchedule(
  supabase: SupabaseClient,
  params: BuildScheduleParams,
): Promise<CleanerSchedule> {
  const { cleanerId, date } = params;
  const travelBuffer = params.travelBufferMin ?? DEFAULT_TRAVEL_BUFFER_MIN;

  const [{ data: cleaner }, { data: availabilityRows }, { data: bookings }] = await Promise.all([
    supabase
      .from("cleaners")
      .select("id, latitude, longitude, home_lat, home_lng")
      .eq("id", cleanerId)
      .maybeSingle(),
    supabase
      .from("cleaner_availability")
      .select("start_time, end_time, is_available")
      .eq("cleaner_id", cleanerId)
      .eq("date", date)
      .eq("is_available", true),
    supabase
      .from("bookings")
      .select("id, service, date, time, duration_minutes, location, location_id, latitude, longitude, status")
      .eq("cleaner_id", cleanerId)
      .eq("date", date)
      .in("status", ["assigned", "in_progress", "completed"]),
  ]);

  const startLat = (cleaner as { latitude?: number | null; home_lat?: number | null } | null)?.latitude ??
    (cleaner as { home_lat?: number | null } | null)?.home_lat ??
    null;
  const startLng = (cleaner as { longitude?: number | null; home_lng?: number | null } | null)?.longitude ??
    (cleaner as { home_lng?: number | null } | null)?.home_lng ??
    null;

  let availabilityStart = 0;
  let availabilityEnd = 24 * 60;
  if ((availabilityRows ?? []).length > 0) {
    const first = availabilityRows?.[0] as { start_time?: string; end_time?: string } | undefined;
    const start = hmToMinutes(String(first?.start_time ?? "00:00"));
    const end = hmToMinutes(String(first?.end_time ?? "23:59"));
    if (Number.isFinite(start)) availabilityStart = start;
    if (Number.isFinite(end)) availabilityEnd = end;
  }

  const normalized = (bookings ?? [])
    .map((row) => normalizeBooking(row as Record<string, unknown>))
    .filter((row): row is ScheduleBooking => row != null);

  const remaining = [...normalized];
  const ordered: CleanerRouteStop[] = [];
  let currentPoint: LatLngPoint | null = startLat != null && startLng != null ? { lat: startLat, lng: startLng } : null;
  let currentMinutes = availabilityStart;

  while (remaining.length > 0) {
    let pickedIdx = -1;
    let pickedDistance = Number.POSITIVE_INFINITY;
    let pickedTravelMin = 0;

    for (let i = 0; i < remaining.length; i += 1) {
      const candidate = remaining[i];
      const startMin = hmToMinutes(candidate.time);
      if (!Number.isFinite(startMin)) continue;
      const hasCoords = currentPoint && candidate.lat != null && candidate.lng != null;
      const distance = hasCoords
        ? getDistanceKm(currentPoint as LatLngPoint, { lat: candidate.lat as number, lng: candidate.lng as number })
        : 0;
      const travelMin = hasCoords ? estimateTravelMinutes(distance) : travelBuffer;
      const earliestStart = currentMinutes + travelMin + travelBuffer;
      const endMin = startMin + candidate.durationMinutes;
      const fitsWindow = startMin >= earliestStart && endMin <= availabilityEnd;
      if (!fitsWindow) continue;
      if (distance < pickedDistance) {
        pickedIdx = i;
        pickedDistance = distance;
        pickedTravelMin = travelMin;
      }
    }

    if (pickedIdx < 0) break;

    const picked = remaining.splice(pickedIdx, 1)[0];
    const startsAtMinutes = hmToMinutes(picked.time);
    const endsAtMinutes = startsAtMinutes + picked.durationMinutes;
    ordered.push({
      ...picked,
      sequence: ordered.length + 1,
      travelKmFromPrev: Number.isFinite(pickedDistance) ? Math.round(pickedDistance * 100) / 100 : 0,
      travelMinutesFromPrev: pickedTravelMin,
      startsAtMinutes,
      endsAtMinutes,
    });
    currentMinutes = endsAtMinutes;
    if (picked.lat != null && picked.lng != null) {
      currentPoint = { lat: picked.lat, lng: picked.lng };
    }
  }

  const totalTravelKm = ordered.reduce((sum, stop) => sum + stop.travelKmFromPrev, 0);
  const totalTravelMinutes = ordered.reduce((sum, stop) => sum + stop.travelMinutesFromPrev, 0);
  const naiveTravelMinutes = ordered.length > 0 ? ordered.length * (travelBuffer + 20) : 0;
  const travelTimeSavedMinutes = Math.max(0, naiveTravelMinutes - totalTravelMinutes);

  return {
    cleanerId,
    date,
    jobs: ordered,
    metrics: {
      jobsCount: ordered.length,
      totalTravelKm: Math.round(totalTravelKm * 100) / 100,
      totalTravelMinutes,
      travelTimeSavedMinutes,
      jobsPerCleanerPerDay: ordered.length,
    },
  };
}
