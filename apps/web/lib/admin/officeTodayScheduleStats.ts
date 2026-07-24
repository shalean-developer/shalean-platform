/** Booking row shape used by `/api/admin/schedule/day` and the office dashboard schedule panel. */
export type OfficeScheduleBookingRow = {
  status: string | null;
  cleaner_id: string | null;
  selected_cleaner_id?: string | null;
  team_id?: string | null;
  is_team_job?: boolean | null;
  booking_cleaners?: readonly { cleaner_id: string; full_name: string | null; role: string }[] | null;
};

export type OfficeTodayScheduleStats = {
  /**
   * Operational bookings for the day — excludes cancelled / failed / payment_expired.
   * Segments (completed + inProgress + upcoming + unassigned) sum to this total.
   */
  total: number;
  /** All rows returned for the day, including terminal cancelled/failed/expired. */
  rawTotal: number;
  completed: number;
  inProgress: number;
  upcoming: number;
  unassigned: number;
  /** cancelled + failed + payment_expired */
  cancelled: number;
};

export function normBookingStatus(status: string | null | undefined): string {
  return String(status ?? "").trim().toLowerCase();
}

/**
 * Confirmed assignment for schedule / Needs Action alignment.
 * `selected_cleaner_id` alone is a preference, not a confirmed cleaner assignment.
 */
export function bookingHasAssignment(row: OfficeScheduleBookingRow): boolean {
  if (String(row.cleaner_id ?? "").trim()) return true;
  if (String(row.team_id ?? "").trim()) return true;
  if ((row.booking_cleaners ?? []).length > 0) return true;
  return false;
}

export function bookingHasPreferredCleanerOnly(row: OfficeScheduleBookingRow): boolean {
  if (bookingHasAssignment(row)) return false;
  return Boolean(String(row.selected_cleaner_id ?? "").trim());
}

export function computeOfficeTodayScheduleStats(bookings: OfficeScheduleBookingRow[]): OfficeTodayScheduleStats {
  let completed = 0;
  let inProgress = 0;
  let upcoming = 0;
  let unassigned = 0;
  let cancelled = 0;

  for (const b of bookings) {
    const st = normBookingStatus(b.status);
    if (st === "completed") {
      completed += 1;
      continue;
    }
    if (st === "cancelled" || st === "failed" || st === "payment_expired") {
      cancelled += 1;
      continue;
    }
    if (st === "in_progress" || st === "en_route") {
      inProgress += 1;
      continue;
    }
    if (bookingHasAssignment(b)) {
      upcoming += 1;
    } else {
      unassigned += 1;
    }
  }

  const total = completed + inProgress + upcoming + unassigned;

  return {
    total,
    rawTotal: bookings.length,
    completed,
    inProgress,
    upcoming,
    unassigned,
    cancelled,
  };
}

export function officeScheduleStatusPresentation(row: OfficeScheduleBookingRow): {
  label: string;
  tone: "unassigned" | "completed" | "in_progress" | "assigned" | "neutral";
} {
  const st = normBookingStatus(row.status);
  if (st === "completed") return { label: "Done", tone: "completed" };
  if (st === "in_progress" || st === "en_route") return { label: "In progress", tone: "in_progress" };
  if (st === "cancelled" || st === "failed" || st === "payment_expired") {
    return { label: st.replace(/_/g, " "), tone: "neutral" };
  }
  if (!bookingHasAssignment(row)) {
    if (bookingHasPreferredCleanerOnly(row)) return { label: "Preferred", tone: "unassigned" };
    return { label: "Unassigned", tone: "unassigned" };
  }
  if (st === "assigned" || st === "confirmed") return { label: "Assigned", tone: "assigned" };
  if (st === "pending" || st === "pending_assignment") return { label: "Pending", tone: "neutral" };
  if (st === "pending_payment") return { label: "Awaiting payment", tone: "neutral" };
  return { label: st ? st.replace(/_/g, " ") : "Scheduled", tone: "assigned" };
}
