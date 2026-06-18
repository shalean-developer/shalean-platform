import "server-only";

import { normalizeUuidCandidate } from "@/lib/booking/userSelectedCleanerFromSnapshot";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Most recent non-cancelled occurrence on this plan that had a cleaner reference.
 * Prefers `cleaner_id` (fully assigned) over `selected_cleaner_id` (customer pick).
 */
export async function fetchLastAssignedCleanerForRecurringPlan(
  admin: SupabaseClient,
  recurringId: string,
): Promise<string | null> {
  const id = recurringId.trim();
  if (!id) return null;

  const { data, error } = await admin
    .from("bookings")
    .select("cleaner_id, selected_cleaner_id, date, created_at")
    .eq("recurring_id", id)
    .neq("status", "cancelled")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !data?.length) return null;

  for (const row of data) {
    const r = row as { cleaner_id?: string | null; selected_cleaner_id?: string | null };
    const assigned = normalizeUuidCandidate(r.cleaner_id ?? null);
    if (assigned) return assigned;
    const selected = normalizeUuidCandidate(r.selected_cleaner_id ?? null);
    if (selected) return selected;
  }

  return null;
}
