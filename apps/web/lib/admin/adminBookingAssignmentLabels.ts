/**
 * Pure helpers for admin list/detail: separate customer checkout pick, dispatch attempt trace, and assignment.
 */

export type AdminBookingAssignmentLabelInput = {
  selected_cleaner_id?: string | null;
  attempted_cleaner_id?: string | null;
  cleaner_id?: string | null;
};

export function normalizeAssignmentUuid(raw: string | null | undefined): string | null {
  const t = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!t || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return null;
  return t;
}

/** Customer preference from `bookings.selected_cleaner_id` (checkout). */
export function adminBookingSelectedAtCheckoutId(row: AdminBookingAssignmentLabelInput): string | null {
  return normalizeAssignmentUuid(row.selected_cleaner_id ?? null);
}

/**
 * Dispatch / offer attempt (`attempted_cleaner_id`). Shown when it adds information beyond checkout + assigned.
 */
export function adminBookingDispatchAttemptId(row: AdminBookingAssignmentLabelInput): string | null {
  const attempted = normalizeAssignmentUuid(row.attempted_cleaner_id ?? null);
  if (!attempted) return null;
  const selected = normalizeAssignmentUuid(row.selected_cleaner_id ?? null);
  const assigned = normalizeAssignmentUuid(row.cleaner_id ?? null);
  if (selected && attempted === selected) return null;
  if (assigned && attempted === assigned) return null;
  return attempted;
}
