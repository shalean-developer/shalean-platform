/**
 * Booking-derived workload labels for the admin Cleaners manage list.
 *
 * Unlike `cleaners.status` (which treats any `assigned` row as `busy`), this
 * matches the office schedule semantics:
 *   - **In progress** — `in_progress` / `en_route`
 *   - **Booked** — `assigned` / `confirmed` with a cleaner on the job
 *   - **Available** — online with no open workload bookings
 *   - **Offline** — manual pause or `cleaners.status = offline`
 */

export type AdminCleanerWorkloadFilterKey = "available" | "booked" | "in_progress" | "offline";

export type AdminCleanerWorkloadDisplay = {
  label: string;
  filter_key: AdminCleanerWorkloadFilterKey;
};

export type AdminCleanerWorkloadBookingRow = {
  status?: string | null;
  cleaner_id?: string | null;
  selected_cleaner_id?: string | null;
  booking_cleaners?: { cleaner_id?: string | null }[] | null;
};

export type AdminCleanerWorkloadFlags = {
  hasActiveJob: boolean;
  hasBookedJob: boolean;
};

const ACTIVE_JOB_STATUSES = new Set(["in_progress", "en_route"]);
const BOOKED_JOB_STATUSES = new Set(["assigned", "confirmed"]);

function collectCleanerIdsFromBookingRow(booking: AdminCleanerWorkloadBookingRow): string[] {
  const fromRoster = (booking.booking_cleaners ?? [])
    .map((member) => String(member.cleaner_id ?? "").trim())
    .filter(Boolean);
  if (fromRoster.length > 0) return fromRoster;
  return [booking.cleaner_id, booking.selected_cleaner_id]
    .map((id) => String(id ?? "").trim())
    .filter(Boolean);
}

/** Aggregate active/booked flags per cleaner from open workload bookings. */
export function buildAdminCleanerWorkloadFlags(
  bookings: AdminCleanerWorkloadBookingRow[],
): Map<string, AdminCleanerWorkloadFlags> {
  const map = new Map<string, AdminCleanerWorkloadFlags>();

  const touch = (cleanerId: string, patch: Partial<AdminCleanerWorkloadFlags>) => {
    const prev = map.get(cleanerId) ?? { hasActiveJob: false, hasBookedJob: false };
    map.set(cleanerId, {
      hasActiveJob: prev.hasActiveJob || patch.hasActiveJob === true,
      hasBookedJob: prev.hasBookedJob || patch.hasBookedJob === true,
    });
  };

  for (const booking of bookings) {
    const st = String(booking.status ?? "").trim().toLowerCase();
    const cleanerIds = collectCleanerIdsFromBookingRow(booking);
    if (cleanerIds.length === 0) continue;

    if (ACTIVE_JOB_STATUSES.has(st)) {
      for (const id of cleanerIds) touch(id, { hasActiveJob: true });
      continue;
    }
    if (BOOKED_JOB_STATUSES.has(st)) {
      for (const id of cleanerIds) touch(id, { hasBookedJob: true });
    }
  }

  return map;
}

export function deriveAdminCleanerWorkloadDisplay(input: {
  isAvailable?: boolean | null;
  dbStatus?: string | null;
  hasActiveJob?: boolean;
  hasBookedJob?: boolean;
}): AdminCleanerWorkloadDisplay {
  if (input.isAvailable === false) {
    return { label: "Offline", filter_key: "offline" };
  }
  const dbSt = String(input.dbStatus ?? "").trim().toLowerCase();
  if (dbSt === "offline") {
    return { label: "Offline", filter_key: "offline" };
  }
  if (input.hasActiveJob) {
    return { label: "In progress", filter_key: "in_progress" };
  }
  if (input.hasBookedJob) {
    return { label: "Booked", filter_key: "booked" };
  }
  return { label: "Available", filter_key: "available" };
}

export function adminCleanerWorkloadDisplayBadgeClass(
  filterKey: AdminCleanerWorkloadFilterKey,
): string {
  switch (filterKey) {
    case "offline":
      return "bg-slate-100 text-slate-700";
    case "in_progress":
      return "bg-violet-100 text-violet-700";
    case "booked":
      return "bg-amber-100 text-amber-800";
    case "available":
    default:
      return "bg-emerald-100 text-emerald-700";
  }
}
