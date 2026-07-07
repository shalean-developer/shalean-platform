import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildAdminCleanerWorkloadFlags,
  deriveAdminCleanerWorkloadDisplay,
  type AdminCleanerWorkloadDisplay,
} from "@/lib/admin/deriveAdminCleanerWorkloadDisplay";
import type { AdminCleanerListRow } from "@/lib/admin/loadAdminCleanersList";

const WORKLOAD_BOOKING_STATUSES = ["assigned", "confirmed", "in_progress", "en_route"] as const;

export type AdminCleanerListRowWithWorkload = AdminCleanerListRow & {
  workload_display: AdminCleanerWorkloadDisplay;
};

async function loadOpenWorkloadBookings(admin: SupabaseClient) {
  const pageSize = 500;
  const rows: Array<{
    status?: string | null;
    cleaner_id?: string | null;
    selected_cleaner_id?: string | null;
    booking_cleaners?: { cleaner_id?: string | null }[] | null;
  }> = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from("bookings")
      .select("status, cleaner_id, selected_cleaner_id, booking_cleaners(cleaner_id)")
      .in("status", [...WORKLOAD_BOOKING_STATUSES])
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  return rows;
}

/** Attach booking-derived workload labels for the admin cleaners manage table. */
export async function enrichAdminCleanersWithWorkloadDisplay(
  admin: SupabaseClient,
  cleaners: AdminCleanerListRow[],
): Promise<AdminCleanerListRowWithWorkload[]> {
  const bookings = await loadOpenWorkloadBookings(admin);
  const flagsByCleaner = buildAdminCleanerWorkloadFlags(bookings);

  return cleaners.map((cleaner) => {
    const flags = flagsByCleaner.get(cleaner.id) ?? { hasActiveJob: false, hasBookedJob: false };
    return {
      ...cleaner,
      workload_display: deriveAdminCleanerWorkloadDisplay({
        isAvailable: cleaner.is_available,
        dbStatus: cleaner.status,
        hasActiveJob: flags.hasActiveJob,
        hasBookedJob: flags.hasBookedJob,
      }),
    };
  });
}
