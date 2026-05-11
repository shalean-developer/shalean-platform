import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { findCleanerSlotOccupancyConflict } from "@/lib/booking/cleanerSlotEligibility";

/**
 * Returns another booking id if this cleaner overlaps an occupying booking on the same calendar day
 * (duration overlap, `booking_date`/`date`, `cleaner_id` and `selected_cleaner_id` holds).
 */
export async function findCleanerSlotConflict(
  admin: SupabaseClient,
  params: {
    cleanerId: string;
    dateYmd: string;
    timeHm: string;
    /** Job length for the proposed slot (defaults to 120m). */
    durationMinutes?: number;
    /** When re-submitting the same create, ignore self (unused on create). */
    excludeBookingId?: string | null;
  },
): Promise<string | null> {
  return findCleanerSlotOccupancyConflict(admin, params);
}
