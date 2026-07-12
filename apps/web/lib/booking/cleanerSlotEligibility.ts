/**
 * Canonical occupancy windows + account gates for cleaner–slot eligibility.
 * Heavy orchestration stays in {@link getEligibleCleaners}; this module holds shared primitives
 * so admin conflict checks, dispatch, and tests stay aligned.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { hmToMinutes } from "@/lib/dispatch/timeWindow";
import { BOOKING_SLOT_OCCUPYING_STATUSES } from "@/lib/booking/bookingCleanerSlotOccupyingStatuses";
import { resolveSchedulingDurationMinutes } from "@/lib/booking/quote/bookingQuotePersistence";

export type { BookingSlotOccupyingStatus } from "@/lib/booking/bookingCleanerSlotOccupyingStatuses";
export { BOOKING_SLOT_OCCUPYING_STATUSES } from "@/lib/booking/bookingCleanerSlotOccupyingStatuses";

/** Bookings that consume a cleaner’s calendar for overlap with a proposed slot. */
export type OccupyingBookingRow = {
  id?: string;
  cleaner_id?: string | null;
  selected_cleaner_id?: string | null;
  status?: string | null;
  date?: string | null;
  booking_date?: string | null;
  time?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  duration_minutes?: number | null;
  estimated_duration_minutes?: number | null;
  pricing_summary?: unknown;
  booking_snapshot?: unknown;
};

const INELIGIBLE_ACCOUNT_STATUS = new Set([
  "offline",
  "suspended",
  "banned",
  "disabled",
  "blocked",
]);

/** Hard blocks for ops assignment — offline/paused cleaners may still be called by office. */
const OPS_INELIGIBLE_ACCOUNT_STATUS = new Set(["suspended", "banned", "disabled", "blocked"]);

/**
 * Row-level gate: active, accepting work, and not in a blocked lifecycle status.
 * Used by customer pool, checkout pre-check, and {@link getEligibleCleaners} preload filtering.
 */
export function cleanerAccountEligibleForCustomerBooking(row: {
  is_active?: boolean | null;
  is_available?: boolean | null;
  status?: string | null;
}): boolean {
  if (row.is_active === false) return false;
  if (row.is_available === false) return false;
  const st = String(row.status ?? "")
    .trim()
    .toLowerCase();
  if (INELIGIBLE_ACCOUNT_STATUS.has(st)) return false;
  return true;
}

/**
 * Ops can still assign cleaners who are offline / manually paused, as long as the
 * account is active and not suspended/banned.
 */
export function cleanerAccountEligibleForOpsAssignment(row: {
  is_active?: boolean | null;
  status?: string | null;
}): boolean {
  if (row.is_active === false) return false;
  const st = String(row.status ?? "")
    .trim()
    .toLowerCase();
  if (OPS_INELIGIBLE_ACCOUNT_STATUS.has(st)) return false;
  return true;
}

export function bookingCalendarDateYmd(row: OccupyingBookingRow): string | null {
  const d = row.booking_date ?? row.date ?? null;
  if (typeof d !== "string") return null;
  const t = d.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

export function bookingMatchesEligibilityDate(row: OccupyingBookingRow, dateYmd: string): boolean {
  return bookingCalendarDateYmd(row) === dateYmd;
}

/**
 * Wall-clock interval [startMin, endMin) style overlap uses half-open in math;
 * we keep legacy inclusive-exclusive overlap: startA < endB && startB < endA.
 */
export function minutesRangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
}

/**
 * Occupancy window for an existing booking row (Johannesburg wall times in `time` / `start_time` / `end_time`).
 */
export function existingBookingOccupancyWindow(row: OccupyingBookingRow): { startMin: number; endMin: number } | null {
  const startRaw = row.start_time ?? row.time ?? null;
  const start = typeof startRaw === "string" ? hmToMinutes(startRaw.trim().slice(0, 5)) : null;
  if (start == null) return null;
  const endRaw = row.end_time;
  const endParsed =
    typeof endRaw === "string" && /^\d{2}:\d{2}/.test(endRaw) ? hmToMinutes(endRaw.trim().slice(0, 5)) : null;
  if (endParsed != null && endParsed > start) {
    return { startMin: start, endMin: endParsed };
  }
  const d = row.duration_minutes;
  const resolved =
    resolveSchedulingDurationMinutes(row, "existingBookingOccupancyWindow") ??
    (typeof d === "number" && Number.isFinite(d) && d >= 30 ? Math.min(12 * 60, Math.round(d)) : null);
  if (resolved == null) return null;
  return { startMin: start, endMin: start + resolved };
}

/**
 * Index occupying rows by every cleaner id that “holds” the slot (assignee + preferred selection).
 */
export function indexOccupyingBookingsByCleanerId(rows: readonly OccupyingBookingRow[]): Map<string, OccupyingBookingRow[]> {
  const m = new Map<string, OccupyingBookingRow[]>();
  for (const row of rows) {
    const ids = new Set<string>();
    const cid = String(row.cleaner_id ?? "").trim();
    const sid = String(row.selected_cleaner_id ?? "").trim();
    if (cid) ids.add(cid);
    if (sid) ids.add(sid);
    for (const id of ids) {
      const arr = m.get(id) ?? [];
      arr.push(row);
      m.set(id, arr);
    }
  }
  return m;
}

export function cleanerHasOccupyingBookingOverlap(
  bookingsForCleaner: readonly OccupyingBookingRow[] | undefined,
  dateYmd: string,
  slotStartMin: number,
  slotEndMin: number,
  excludeBookingId?: string | null,
): boolean {
  for (const b of bookingsForCleaner ?? []) {
    const bid = typeof b.id === "string" ? b.id.trim() : "";
    if (excludeBookingId && bid && bid === excludeBookingId) continue;
    if (!bookingMatchesEligibilityDate(b, dateYmd)) continue;
    const win = existingBookingOccupancyWindow(b);
    if (!win) continue;
    if (minutesRangesOverlap(slotStartMin, slotEndMin, win.startMin, win.endMin)) return true;
  }
  return false;
}

export function cleanerHasOccupyingSlotOverlap(
  byCleaner: Map<string, OccupyingBookingRow[]>,
  cleanerId: string,
  dateYmd: string,
  slotStartMin: number,
  slotEndMin: number,
  excludeBookingId?: string | null,
): boolean {
  return cleanerHasOccupyingBookingOverlap(
    byCleaner.get(cleanerId),
    dateYmd,
    slotStartMin,
    slotEndMin,
    excludeBookingId,
  );
}

/**
 * Admin / ops: first occupying booking id whose window overlaps the proposed slot for this cleaner
 * (matches {@link BOOKING_SLOT_OCCUPYING_STATUSES} and both `cleaner_id` and `selected_cleaner_id`).
 */
export async function findCleanerSlotOccupancyConflict(
  admin: SupabaseClient,
  params: {
    cleanerId: string;
    dateYmd: string;
    timeHm: string;
    durationMinutes?: number;
    excludeBookingId?: string | null;
  },
): Promise<string | null> {
  const { cleanerId, dateYmd, timeHm, excludeBookingId } = params;
  const t = timeHm.trim().slice(0, 5);
  const duration = Math.max(30, Math.round(params.durationMinutes ?? 120));
  if (!/^[0-9a-f-]{36}$/i.test(cleanerId) || !/^\d{4}-\d{2}-\d{2}$/.test(dateYmd) || !/^\d{2}:\d{2}$/.test(t)) {
    return null;
  }
  const slotStart = hmToMinutes(t);
  if (slotStart == null) return null;
  const slotEnd = slotStart + duration;

  const { data, error } = await admin
    .from("bookings")
    .select("id, cleaner_id, selected_cleaner_id, date, booking_date, time, start_time, end_time, duration_minutes, estimated_duration_minutes, pricing_summary, booking_snapshot")
    .in("status", [...BOOKING_SLOT_OCCUPYING_STATUSES])
    .or(`cleaner_id.eq.${cleanerId},selected_cleaner_id.eq.${cleanerId}`)
    .or(`date.eq.${dateYmd},booking_date.eq.${dateYmd}`);

  if (error || !Array.isArray(data)) return null;

  for (const raw of data) {
    const row = raw as OccupyingBookingRow;
    const bid = typeof row.id === "string" ? row.id.trim() : "";
    if (excludeBookingId && bid && bid === excludeBookingId) continue;
    const cid = String(row.cleaner_id ?? "").trim();
    const sid = String(row.selected_cleaner_id ?? "").trim();
    if (cid !== cleanerId && sid !== cleanerId) continue;
    if (!bookingMatchesEligibilityDate(row, dateYmd)) continue;
    const win = existingBookingOccupancyWindow(row);
    if (!win) continue;
    if (minutesRangesOverlap(slotStart, slotEnd, win.startMin, win.endMin) && bid) return bid;
  }
  return null;
}
