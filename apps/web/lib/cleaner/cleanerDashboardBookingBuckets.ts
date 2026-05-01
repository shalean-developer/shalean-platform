import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";

function stOf(r: CleanerBookingRow): string {
  return String(r.status ?? "").trim().toLowerCase();
}

function crsOf(r: CleanerBookingRow): string {
  return String(r.cleaner_response_status ?? "").trim().toLowerCase();
}

/** Assigned to this cleaner and awaiting accept/reject. */
export function filterNewJobsNeedingResponse(rows: CleanerBookingRow[]): CleanerBookingRow[] {
  return rows.filter((r) => {
    if (stOf(r) !== "assigned") return false;
    const crs = crsOf(r);
    return crs === CLEANER_RESPONSE.PENDING || crs === "";
  });
}

/** In-flight work (accepted / en route / started / confirmed / in progress). */
export function filterActiveJobs(rows: CleanerBookingRow[]): CleanerBookingRow[] {
  return rows.filter((r) => {
    const st = stOf(r);
    if (st === "confirmed" || st === "in_progress") return true;
    if (st !== "assigned") return false;
    const crs = crsOf(r);
    if (crs === CLEANER_RESPONSE.PENDING || crs === "") return false;
    return (
      crs === CLEANER_RESPONSE.ACCEPTED ||
      crs === CLEANER_RESPONSE.ON_MY_WAY ||
      crs === CLEANER_RESPONSE.STARTED
    );
  });
}

export function filterCompletedJobs(rows: CleanerBookingRow[]): CleanerBookingRow[] {
  return rows.filter((r) => stOf(r) === "completed");
}

export const CLEANER_DASHBOARD_STATUS_LABEL: Record<string, string> = {
  assigned: "New Job",
  pending: "Pending",
  confirmed: "Confirmed",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function dashboardStatusLabel(status: string | null | undefined): string {
  const k = String(status ?? "").trim().toLowerCase();
  return CLEANER_DASHBOARD_STATUS_LABEL[k] ?? (k ? k.replace(/_/g, " ") : "—");
}
