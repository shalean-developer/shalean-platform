import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKING_CLEANER_SLOT_OCCUPYING_STATUSES } from "@/lib/booking/bookingCleanerSlotOccupyingStatuses";

/**
 * Returns another booking id if this cleaner is already tied to the same date+time.
 * Matches rows where **either** `cleaner_id` **or** `selected_cleaner_id` equals the candidate
 * (covers assigned jobs and pre-payment preferred-cleaner holds).
 */
export async function findCleanerSlotConflict(
  admin: SupabaseClient,
  params: {
    cleanerId: string;
    dateYmd: string;
    timeHm: string;
    /** When re-submitting the same create, ignore self (unused on create). */
    excludeBookingId?: string | null;
  },
): Promise<string | null> {
  const { cleanerId, dateYmd, timeHm, excludeBookingId } = params;
  const t = timeHm.trim().slice(0, 5);
  if (!/^[0-9a-f-]{36}$/i.test(cleanerId) || !/^\d{4}-\d{2}-\d{2}$/.test(dateYmd) || !/^\d{2}:\d{2}$/.test(t)) {
    return null;
  }

  let q = admin
    .from("bookings")
    .select("id")
    .eq("date", dateYmd)
    .eq("time", t)
    .in("status", [...BOOKING_CLEANER_SLOT_OCCUPYING_STATUSES])
    .or(`cleaner_id.eq.${cleanerId},selected_cleaner_id.eq.${cleanerId}`)
    .limit(1);

  if (excludeBookingId && /^[0-9a-f-]{36}$/i.test(excludeBookingId)) {
    q = q.neq("id", excludeBookingId);
  }

  const { data, error } = await q.maybeSingle();
  if (error || !data || typeof (data as { id?: unknown }).id !== "string") return null;
  return (data as { id: string }).id;
}
