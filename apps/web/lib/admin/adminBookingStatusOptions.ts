import { canonicalDbBookingStatus } from "@/lib/booking/canonicalBookingStatus";

/** Admin-selectable lifecycle statuses (DB vocabulary). */
export const ADMIN_BOOKING_STATUS_VALUES = [
  "pending",
  "pending_payment",
  "area_review",
  "assigned",
  "in_progress",
  "completed",
  "cancelled",
  "failed",
] as const;

export type AdminBookingStatusValue = (typeof ADMIN_BOOKING_STATUS_VALUES)[number];

const ADMIN_STATUS_LABELS: Record<AdminBookingStatusValue, string> = {
  pending: "Pending",
  pending_payment: "Pending payment",
  area_review: "Area Review",
  assigned: "Assigned",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  failed: "Failed",
};

export function adminBookingStatusLabel(status: string): string {
  const s = canonicalDbBookingStatus(status) as AdminBookingStatusValue;
  return ADMIN_STATUS_LABELS[s] ?? status;
}

export function isAllowedAdminBookingStatusChange(status: string): status is AdminBookingStatusValue {
  const s = canonicalDbBookingStatus(status);
  return (ADMIN_BOOKING_STATUS_VALUES as readonly string[]).includes(s);
}

export const ADMIN_BOOKING_STATUS_OPTIONS = ADMIN_BOOKING_STATUS_VALUES.map((value) => ({
  value,
  label: ADMIN_STATUS_LABELS[value],
}));
