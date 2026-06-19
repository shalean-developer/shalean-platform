/** Booking row shape used by `/api/admin/schedule/day` and the office dashboard schedule panel. */
export type OfficeScheduleBookingRow = {
  status: string | null;
  cleaner_id: string | null;
  selected_cleaner_id?: string | null;
  team_id?: string | null;
  is_team_job?: boolean | null;
};

export type OfficeTodayScheduleStats = {
  total: number;
  completed: number;
  inProgress: number;
  upcoming: number;
  unassigned: number;
};

export function normBookingStatus(status: string | null | undefined): string {
  return String(status ?? "").trim().toLowerCase();
}

export function bookingHasAssignment(row: OfficeScheduleBookingRow): boolean {
  if (String(row.cleaner_id ?? "").trim()) return true;
  if (String(row.selected_cleaner_id ?? "").trim()) return true;
  if (String(row.team_id ?? "").trim()) return true;
  return false;
}

export function computeOfficeTodayScheduleStats(bookings: OfficeScheduleBookingRow[]): OfficeTodayScheduleStats {
  let completed = 0;
  let inProgress = 0;
  let upcoming = 0;
  let unassigned = 0;

  for (const b of bookings) {
    const st = normBookingStatus(b.status);
    if (st === "completed") {
      completed += 1;
      continue;
    }
    if (st === "cancelled" || st === "failed" || st === "payment_expired") {
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

  return {
    total: bookings.length,
    completed,
    inProgress,
    upcoming,
    unassigned,
  };
}

export function officeScheduleStatusPresentation(row: OfficeScheduleBookingRow): {
  label: string;
  tone: "unassigned" | "completed" | "in_progress" | "assigned" | "neutral";
} {
  const st = normBookingStatus(row.status);
  if (st === "completed") return { label: "Done", tone: "completed" };
  if (st === "in_progress" || st === "en_route") return { label: "In progress", tone: "in_progress" };
  if (!bookingHasAssignment(row) && st !== "cancelled" && st !== "failed") {
    return { label: "Unassigned", tone: "unassigned" };
  }
  if (st === "assigned" || st === "confirmed") return { label: "Assigned", tone: "assigned" };
  if (st === "pending" || st === "pending_assignment") return { label: "Pending", tone: "neutral" };
  if (st === "pending_payment") return { label: "Awaiting payment", tone: "neutral" };
  return { label: st ? st.replace(/_/g, " ") : "Scheduled", tone: "assigned" };
}
