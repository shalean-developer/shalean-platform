/**
 * Cleaner availability and slot windows only — no ZAR pricing (see `lib/pricing/pricingEngine.ts`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type AvailableCleaner = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  rating: number;
  is_available: boolean;
  jobs_completed: number;
  distance_km: number | null;
  base_lat: number | null;
  base_lng: number | null;
};

type CleanerRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  rating: number | null;
  is_available: boolean | null;
  jobs_completed: number | null;
  home_lat?: number | null;
  home_lng?: number | null;
  latitude?: number | null;
  longitude?: number | null;
};

/** Matches `cleaner_availability` — date-based only (no day_of_week). */
export type CleanerAvailabilityRow = {
  cleaner_id: string;
  start_time: string | null;
  end_time: string | null;
  date: string | null;
  is_available: boolean | null;
};

type BookingRow = {
  cleaner_id: string | null;
  status: string | null;
  date?: string | null;
  booking_date?: string | null;
  time?: string | null;
  start_time?: string | null;
  end_time?: string | null;
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
    Math.cos(toRad(aLat)) *
      Math.cos(toRad(bLat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return Number((R * c).toFixed(2));
}

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
function slotWithinWindow(slotStart: number, slotEnd: number, winStart: number, winEnd: number): boolean {
  return slotStart >= winStart && slotEnd <= winEnd;
}

async function fetchAvailabilityForDate(
  admin: SupabaseClient,
  selectedDate: string,
): Promise<CleanerAvailabilityRow[]> {
  const res = await admin
    .from("cleaner_availability")
    .select("cleaner_id, date, start_time, end_time, is_available")
    .eq("date", selectedDate)
    .eq("is_available", true);

  if (res.error) {
    console.error("[availabilityEngine] cleaner_availability query failed:", res.error.message);
    return [];
  }
  return (res.data ?? []) as CleanerAvailabilityRow[];
}

export type GetAvailableCleanersArgs = {
  userLat?: number | null;
  userLng?: number | null;
  selectedDate: string;
  selectedTime: string;
  durationMinutes?: number;
  limit?: number;
  /**
   * When set, skips fetching `cleaner_availability` again (used by slot generator).
   */
  availabilityRows?: CleanerAvailabilityRow[];
};

export async function getAvailableCleaners(
  admin: SupabaseClient,
  args: GetAvailableCleanersArgs,
): Promise<AvailableCleaner[]> {
  const durationMinutes = args.durationMinutes ?? 120;
  const limit = args.limit ?? 5;
  const selectedStart = toMinutes(args.selectedTime);
  const selectedEnd = selectedStart + durationMinutes;

  let availRows: CleanerAvailabilityRow[];
  if (args.availabilityRows != null) {
    availRows = args.availabilityRows;
  } else {
    availRows = await fetchAvailabilityForDate(admin, args.selectedDate);
  }

  const [cleanersRes, bookingsRes] = await Promise.all([
    admin
      .from("cleaners")
      .select("id, full_name, phone, email, rating, is_available, jobs_completed, home_lat, home_lng, latitude, longitude")
      .eq("is_available", true),
    admin
      .from("bookings")
      .select("cleaner_id, status, date, booking_date, time, start_time, end_time")
      .in("status", ["confirmed", "pending"])
      .or(`date.eq.${args.selectedDate},booking_date.eq.${args.selectedDate}`),
  ]);

  if (cleanersRes.error) {
    console.error("[availabilityEngine] cleaners query failed:", cleanersRes.error.message);
    return [];
  }

  const bookingRows: BookingRow[] = bookingsRes.error ? [] : ((bookingsRes.data ?? []) as BookingRow[]);
  if (bookingsRes.error) {
    console.error("[availabilityEngine] bookings query failed:", bookingsRes.error.message);
  }

  const cleaners = (cleanersRes.data ?? []) as CleanerRow[];

  const availabilityMap = new Map<string, CleanerAvailabilityRow[]>();
  for (const row of availRows) {
    if (row.date != null && row.date !== args.selectedDate) continue;
    const arr = availabilityMap.get(row.cleaner_id) ?? [];
    arr.push(row);
    availabilityMap.set(row.cleaner_id, arr);
  }

  const bookingsByCleaner = new Map<string, BookingRow[]>();
  for (const row of bookingRows) {
    if (!row.cleaner_id) continue;
    const arr = bookingsByCleaner.get(row.cleaner_id) ?? [];
    arr.push(row);
    bookingsByCleaner.set(row.cleaner_id, arr);
  }

  const filtered = cleaners.filter((cleaner) => {
    const avail = availabilityMap.get(cleaner.id) ?? [];

    // Only enforce granular windows when *this* cleaner has rows for the date.
    // Otherwise sparse `cleaner_availability` data would hide every cleaner with no rows.
    const hasAvailability =
      avail.length === 0
        ? true
        : avail.some((a) => {
            const winStart =
              a.start_time && /^\d{2}:\d{2}/.test(a.start_time) ? toMinutes(a.start_time) : null;
            const winEnd = a.end_time && /^\d{2}:\d{2}/.test(a.end_time) ? toMinutes(a.end_time) : null;
            if (winStart == null || winEnd == null) return false;
            const flag = a.is_available ?? true;
            return flag && slotWithinWindow(selectedStart, selectedEnd, winStart, winEnd);
          });

    if (!hasAvailability) return false;

    const bookingConflicts = (bookingsByCleaner.get(cleaner.id) ?? []).some((b) => {
      if (bookingDate(b) !== args.selectedDate) return false;
      const win = bookingWindow(b);
      if (!win) return false;
      return isOverlap(selectedStart, selectedEnd, win.start, win.end);
    });
    return !bookingConflicts;
  });

  const withDistance: AvailableCleaner[] = filtered.map((c) => {
    const lat = c.latitude ?? c.home_lat ?? null;
    const lng = c.longitude ?? c.home_lng ?? null;
    const canCalc =
      typeof args.userLat === "number" &&
      typeof args.userLng === "number" &&
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
      distance_km: canCalc ? haversineKm(args.userLat!, args.userLng!, lat!, lng!) : null,
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

/**
 * True when `cleanerId` is in the same pool as `/api/booking/cleaners` for that slot
 * (flags + `cleaner_availability` + booking conflicts). Used at Paystack upsert to honor or fall back.
 */
export async function isCleanerInAvailablePoolForSlot(
  admin: SupabaseClient,
  args: {
    cleanerId: string;
    selectedDate: string;
    selectedTime: string;
    durationMinutes?: number;
  },
): Promise<boolean> {
  const pool = await getAvailableCleaners(admin, {
    selectedDate: args.selectedDate,
    selectedTime: args.selectedTime,
    durationMinutes: args.durationMinutes ?? 120,
    limit: 500,
  });
  return pool.some((c) => c.id === args.cleanerId);
}

/**
 * Slot grid for a day. `durationMinutes` must match the visit length from the pricing engine
 * (callers pass `duration` from `calculateBookingPrice` / `quoteJobDurationHours`).
 */
export async function getAvailableTimeSlots(
  admin: SupabaseClient,
  args: {
    selectedDate: string;
    durationMinutes: number;
    userLat?: number | null;
    userLng?: number | null;
    startHour?: number;
    endHour?: number;
    stepMinutes?: number;
  },
): Promise<Array<{ time: string; available: boolean; cleanersCount: number }>> {
  const startHour = args.startHour ?? 7;
  const endHour = args.endHour ?? 18;
  const stepMinutes = args.stepMinutes ?? 30;
  const out: Array<{ time: string; available: boolean; cleanersCount: number }> = [];

  try {
    const availabilityRows = await fetchAvailabilityForDate(admin, args.selectedDate);

    for (let mins = startHour * 60; mins <= endHour * 60; mins += stepMinutes) {
      const hh = String(Math.floor(mins / 60)).padStart(2, "0");
      const mm = String(mins % 60).padStart(2, "0");
      const time = `${hh}:${mm}`;

      const cleaners = await getAvailableCleaners(admin, {
        userLat: args.userLat,
        userLng: args.userLng,
        selectedDate: args.selectedDate,
        selectedTime: time,
        durationMinutes: args.durationMinutes,
        limit: 50,
        availabilityRows,
      });

      out.push({
        time,
        available: cleaners.length > 0,
        cleanersCount: cleaners.length,
      });
    }

  } catch (e) {
    console.error("[availabilityEngine] getAvailableTimeSlots failed:", e);
    return [];
  }

  return out;
}
