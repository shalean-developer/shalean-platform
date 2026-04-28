import type { DashboardBooking } from "@/lib/dashboard/types";

export type CustomerBookingStatusLabel =
  | "Scheduled"
  | "Completed"
  | "Completed (billed monthly)"
  | "Billed monthly"
  | "Cancelled"
  | "Failed";

export function customerBookingStatusLabel(b: DashboardBooking): CustomerBookingStatusLabel {
  const st = b.status;
  const ps = String(b.raw.payment_status ?? "")
    .trim()
    .toLowerCase();
  if (st === "completed") {
    if (ps === "pending_monthly") return "Completed (billed monthly)";
    return "Completed";
  }
  if (st === "cancelled") return "Cancelled";
  if (st === "failed") return "Failed";
  if (ps === "pending_monthly") return "Billed monthly";
  return "Scheduled";
}

export function customerNotesFromBooking(b: DashboardBooking): string {
  const snap = b.raw.booking_snapshot;
  if (!snap || typeof snap !== "object" || Array.isArray(snap)) return "";
  const notes = (snap as { customer_notes?: unknown }).customer_notes;
  return typeof notes === "string" ? notes.trim() : "";
}
