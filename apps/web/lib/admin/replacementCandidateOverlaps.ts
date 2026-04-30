import type { SupabaseClient } from "@supabase/supabase-js";
import {
  busyUntilFromOverlappingJobs,
  effectiveJobDurationMinutes,
  SCHEDULE_DEMAND_STATUSES,
} from "@/lib/admin/adminAssignEligibility";
import { hmToMinutes } from "@/lib/dispatch/timeWindow";

type OtherJob = { time: string | null; duration_minutes?: number | null };

/**
 * Builds per-cleaner lists of other jobs on the same calendar day that can block the demand slot.
 * Includes solo `bookings.cleaner_id` assignments and `booking_cleaners` roster rows.
 */
export async function loadCleanerDayScheduleOthers(
  admin: SupabaseClient,
  params: { dateYmd: string; excludeBookingId: string },
): Promise<Map<string, OtherJob[]>> {
  const out = new Map<string, OtherJob[]>();
  const { dateYmd, excludeBookingId } = params;

  const { data: dayBookings, error: bErr } = await admin
    .from("bookings")
    .select("id, cleaner_id, time, duration_minutes, status")
    .eq("date", dateYmd)
    .neq("id", excludeBookingId)
    .in("status", [...SCHEDULE_DEMAND_STATUSES]);

  if (bErr) {
    console.error("[replacementCandidateOverlaps] bookings", bErr.message);
    return out;
  }

  const rows = (dayBookings ?? []) as Array<{
    id?: string;
    cleaner_id?: string | null;
    time?: string | null;
    duration_minutes?: number | null;
    status?: string | null;
  }>;

  const bookingMeta = new Map<string, { time: string | null; duration_minutes?: number | null }>();
  const bookingIds: string[] = [];

  for (const r of rows) {
    const id = String(r.id ?? "").trim();
    if (!id) continue;
    bookingIds.push(id);
    bookingMeta.set(id, { time: r.time ?? null, duration_minutes: r.duration_minutes });
    const cid = String(r.cleaner_id ?? "").trim();
    if (!cid) continue;
    if (!out.has(cid)) out.set(cid, []);
    out.get(cid)!.push({ time: r.time ?? null, duration_minutes: r.duration_minutes });
  }

  if (bookingIds.length === 0) return out;

  const { data: roster, error: rErr } = await admin
    .from("booking_cleaners")
    .select("cleaner_id, booking_id")
    .in("booking_id", bookingIds);

  if (rErr) {
    console.error("[replacementCandidateOverlaps] booking_cleaners", rErr.message);
    return out;
  }

  for (const raw of roster ?? []) {
    const row = raw as { cleaner_id?: string | null; booking_id?: string | null };
    const cid = String(row.cleaner_id ?? "").trim();
    const bid = String(row.booking_id ?? "").trim();
    if (!cid || !bid) continue;
    const meta = bookingMeta.get(bid);
    if (!meta) continue;
    if (!out.has(cid)) out.set(cid, []);
    out.get(cid)!.push({ time: meta.time, duration_minutes: meta.duration_minutes });
  }

  for (const [cid, list] of out) {
    const seen = new Set<string>();
    const deduped: OtherJob[] = [];
    for (const o of list) {
      const k = `${o.time ?? ""}|${String(o.duration_minutes ?? "")}`;
      if (seen.has(k)) continue;
      seen.add(k);
      deduped.push(o);
    }
    out.set(cid, deduped);
  }

  return out;
}

export function cleanerOverlapsDemandSlot(
  cleanerId: string,
  othersByCleaner: Map<string, OtherJob[]>,
  demandStartMin: number,
  demandDurationMin: number,
): boolean {
  const others = othersByCleaner.get(cleanerId) ?? [];
  return busyUntilFromOverlappingJobs(demandStartMin, demandDurationMin, others) != null;
}

export function bookingDemandWindowMinutes(booking: {
  time?: string | null;
  duration_minutes?: number | null;
}): { startMin: number; durationMin: number } | null {
  const timeHm = String(booking.time ?? "").trim();
  const start = hmToMinutes(timeHm.slice(0, 5));
  if (start == null) return null;
  const durationMin = effectiveJobDurationMinutes(booking);
  return { startMin: start, durationMin };
}
