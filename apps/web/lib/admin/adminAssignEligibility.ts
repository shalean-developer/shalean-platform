import type { SupabaseClient } from "@supabase/supabase-js";
import { isBookingTimeInWindow, hmToMinutes } from "@/lib/dispatch/timeWindow";

export const DEFAULT_ASSIGN_JOB_DURATION_MIN = 240;

type AvRow = { start_time: string; end_time: string; is_available: boolean };

/** Mirrors admin assign route: booking time falls in an `is_available` window for that date. */
export function cleanerSlotMatchesCalendar(windows: AvRow[], bookingTimeHm: string): boolean {
  const hm = bookingTimeHm.trim().slice(0, 5);
  for (const w of windows) {
    if (!w.is_available) continue;
    if (isBookingTimeInWindow(hm, String(w.start_time).slice(0, 5), String(w.end_time).slice(0, 5))) {
      return true;
    }
  }
  return false;
}

function intervalsOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

function dayMinutes(hm: string | null | undefined): number | null {
  if (!hm) return null;
  return hmToMinutes(hm.trim().slice(0, 5));
}

const ACTIVE = new Set(["pending", "assigned", "in_progress", "confirmed"]);

/** Bookings that still consume capacity in the schedule for overlap / demand hints. */
export const SCHEDULE_DEMAND_STATUSES = new Set([
  "pending",
  "pending_payment",
  "assigned",
  "in_progress",
  "confirmed",
]);

export function effectiveJobDurationMinutes(row: { duration_minutes?: number | null }): number {
  const d = row.duration_minutes;
  if (typeof d === "number" && Number.isFinite(d) && d > 0) return Math.min(9 * 60, Math.max(60, d));
  return DEFAULT_ASSIGN_JOB_DURATION_MIN;
}

/**
 * If another job blocks this slot for the same cleaner/date, return busy-until (minutes from midnight).
 */
export function busyUntilFromOverlappingJobs(
  bookingStartMin: number,
  bookingDurationMin: number,
  others: Array<{ time: string | null; duration_minutes?: number | null }>,
): number | null {
  return overlapBlockingDetail(bookingStartMin, bookingDurationMin, others).busyUntilMin;
}

/**
 * Busy-until (end of latest overlapping job) plus the time range of the job that drives that end
 * (for admin UI copy).
 */
export function overlapBlockingDetail(
  bookingStartMin: number,
  bookingDurationMin: number,
  others: Array<{ time: string | null; duration_minutes?: number | null }>,
): { busyUntilMin: number | null; overlapJobRangeLabel: string | null } {
  const bookingEnd = bookingStartMin + bookingDurationMin;
  let maxEnd: number | null = null;
  let rangeAtMax: string | null = null;
  for (const o of others) {
    const os = dayMinutes(o.time);
    if (os == null) continue;
    const od = effectiveJobDurationMinutes(o);
    const oe = os + od;
    if (intervalsOverlap(bookingStartMin, bookingEnd, os, oe)) {
      const rangeLabel = `${formatMinutesAsHm(os)}–${formatMinutesAsHm(oe)}`;
      if (maxEnd == null || oe > maxEnd) {
        maxEnd = oe;
        rangeAtMax = rangeLabel;
      }
    }
  }
  return { busyUntilMin: maxEnd, overlapJobRangeLabel: rangeAtMax };
}

const NEXT_SLOT_STEP_MIN = 15;
const NEXT_SLOT_SEARCH_END_MIN = 21 * 60;

/**
 * Earliest HH:mm (same day, 15-minute grid) at or after `startFromMin` where this cleaner has
 * calendar coverage at start and no overlap with `others` for `durationMin`.
 */
export function nextAvailableBookingStartHm(
  startFromMin: number,
  durationMin: number,
  windows: AvRow[],
  others: Array<{ time: string | null; duration_minutes?: number | null }>,
): string | null {
  let t = Math.ceil(startFromMin / NEXT_SLOT_STEP_MIN) * NEXT_SLOT_STEP_MIN;
  for (; t + durationMin <= NEXT_SLOT_SEARCH_END_MIN; t += NEXT_SLOT_STEP_MIN) {
    const hm = formatMinutesAsHm(t);
    if (!cleanerSlotMatchesCalendar(windows, hm)) continue;
    if (busyUntilFromOverlappingJobs(t, durationMin, others) != null) continue;
    return hm;
  }
  return null;
}

/**
 * How many bookings on the same day overlap this time window (demand statuses). Includes every
 * overlapping row (e.g. two customers at 10:00 → 2).
 */
export async function countBookingsOverlappingDemandSlot(
  admin: SupabaseClient,
  params: { dateYmd: string; cityId: string | null; slotStartMin: number; slotDurationMin: number },
): Promise<number> {
  const { dateYmd, cityId, slotStartMin, slotDurationMin } = params;
  const slotEnd = slotStartMin + slotDurationMin;
  let q = admin
    .from("bookings")
    .select("id, time, duration_minutes, status")
    .eq("date", dateYmd);
  if (cityId) q = q.eq("city_id", cityId);
  const { data: rows } = await q;
  let n = 0;
  for (const raw of rows ?? []) {
    const row = raw as {
      id?: string;
      time?: string | null;
      duration_minutes?: number | null;
      status?: string | null;
    };
    const st = String(row.status ?? "").toLowerCase();
    if (!SCHEDULE_DEMAND_STATUSES.has(st)) continue;
    const os = dayMinutes(row.time);
    if (os == null) continue;
    const od = effectiveJobDurationMinutes(row);
    const oe = os + od;
    if (!intervalsOverlap(slotStartMin, slotEnd, os, oe)) continue;
    n += 1;
  }
  return n;
}

export function formatMinutesAsHm(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = Math.round(mins % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export type AssignEligibilityRow = {
  cleanerId: string;
  slotCalendarOk: boolean;
  overlapBlocked: boolean;
  busyUntilMin: number | null;
  /** e.g. "10:00–13:30" for the job that extends busy-until (admin copy). */
  overlapJobRangeLabel: string | null;
  /** Same-day next start (15m grid) with calendar + no overlap, when current slot is blocked (non-offline). */
  nextAvailableStartHm: string | null;
  offline: boolean;
  /** Same gate as POST assign without force. */
  canAssignWithoutForce: boolean;
};

export async function computeAssignEligibility(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    bookingDateYmd: string;
    bookingTimeHm: string;
    durationMinutes: number;
    cleanerIds: string[];
  },
): Promise<Map<string, AssignEligibilityRow>> {
  const out = new Map<string, AssignEligibilityRow>();
  const { bookingId, bookingDateYmd, bookingTimeHm, durationMinutes, cleanerIds } = params;
  const startMin = dayMinutes(bookingTimeHm);
  if (!cleanerIds.length || startMin == null) {
    for (const id of cleanerIds) {
      out.set(id, {
        cleanerId: id,
        slotCalendarOk: false,
        overlapBlocked: false,
        busyUntilMin: null,
        overlapJobRangeLabel: null,
        nextAvailableStartHm: null,
        offline: false,
        canAssignWithoutForce: false,
      });
    }
    return out;
  }

  const { data: cleaners } = await admin
    .from("cleaners")
    .select("id, status")
    .in("id", cleanerIds);

  const offlineById = new Map<string, boolean>();
  for (const c of cleaners ?? []) {
    const row = c as { id?: string; status?: string | null };
    if (row.id) offlineById.set(String(row.id), String(row.status ?? "").toLowerCase() === "offline");
  }

  const { data: avRows } = await admin
    .from("cleaner_availability")
    .select("cleaner_id, start_time, end_time, is_available")
    .eq("date", bookingDateYmd)
    .in("cleaner_id", cleanerIds);

  const windowsByCleaner = new Map<string, AvRow[]>();
  for (const id of cleanerIds) windowsByCleaner.set(id, []);
  for (const r of avRows ?? []) {
    const row = r as { cleaner_id?: string; start_time?: string; end_time?: string; is_available?: boolean };
    const cid = String(row.cleaner_id ?? "");
    if (!cid) continue;
    const list = windowsByCleaner.get(cid);
    if (!list) continue;
    list.push({
      start_time: String(row.start_time ?? "00:00"),
      end_time: String(row.end_time ?? "23:59"),
      is_available: Boolean(row.is_available),
    });
  }

  const { data: dayBookings } = await admin
    .from("bookings")
    .select("id, cleaner_id, time, duration_minutes, status")
    .eq("date", bookingDateYmd)
    .in("cleaner_id", cleanerIds)
    .neq("id", bookingId);

  const othersByCleaner = new Map<string, Array<{ time: string | null; duration_minutes?: number | null }>>();
  for (const id of cleanerIds) othersByCleaner.set(id, []);
  for (const b of dayBookings ?? []) {
    const row = b as {
      id?: string;
      cleaner_id?: string | null;
      time?: string | null;
      duration_minutes?: number | null;
      status?: string | null;
    };
    const st = String(row.status ?? "").toLowerCase();
    if (!ACTIVE.has(st)) continue;
    const cid = String(row.cleaner_id ?? "");
    const list = othersByCleaner.get(cid);
    if (list) list.push({ time: row.time ?? null, duration_minutes: row.duration_minutes });
  }

  for (const id of cleanerIds) {
    const windows = windowsByCleaner.get(id) ?? [];
    const slotCalendarOk = cleanerSlotMatchesCalendar(windows, bookingTimeHm);
    const others = othersByCleaner.get(id) ?? [];
    const overlapDetail = overlapBlockingDetail(startMin, durationMinutes, others);
    const busyUntilMin = overlapDetail.busyUntilMin;
    const overlapJobRangeLabel = overlapDetail.overlapJobRangeLabel;
    const overlapBlocked = busyUntilMin != null;
    const offline = offlineById.get(id) ?? false;
    const canAssignWithoutForce = slotCalendarOk && !overlapBlocked && !offline;
    let nextAvailableStartHm: string | null = null;
    if (!offline && !canAssignWithoutForce) {
      nextAvailableStartHm = nextAvailableBookingStartHm(startMin, durationMinutes, windows, others);
      const curHm = bookingTimeHm.trim().slice(0, 5);
      if (nextAvailableStartHm === curHm) nextAvailableStartHm = null;
    }

    out.set(id, {
      cleanerId: id,
      slotCalendarOk,
      overlapBlocked,
      busyUntilMin,
      overlapJobRangeLabel,
      nextAvailableStartHm,
      offline,
      canAssignWithoutForce,
    });
  }

  return out;
}
