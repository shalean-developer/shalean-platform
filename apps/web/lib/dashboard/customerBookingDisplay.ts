import type { BookingOperationalPhase } from "@/lib/booking/deriveBookingOperationalPhase";
import { isAuthoritativeBookingCompleted } from "@/lib/booking/deriveBookingOperationalPhase";
import type { OperationalDisplayTone } from "@/lib/booking/describeBookingOperationalState";
import { describeDashboardBookingOperational } from "@/lib/dashboard/dashboardBookingOperational";
import type { DashboardBooking } from "@/lib/dashboard/types";

export { customerPreferredDispatchNotice } from "@/lib/dispatch/preferredCleanerDispatchPolicy";

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
  const authDone = isAuthoritativeBookingCompleted({
    status: b.raw.status ?? st,
    completed_at: b.raw.completed_at,
  });
  if (authDone) {
    if (ps === "pending_monthly") return "Completed (billed monthly)";
    return "Completed";
  }
  if (st === "cancelled") return "Cancelled";
  if (st === "failed") return "Failed";
  if (ps === "pending_monthly") return "Billed monthly";
  return "Scheduled";
}

/**
 * Customer booking card: prefer API `raw.canonicalLifecycle` when it matches the same
 * {@link describeDashboardBookingOperational} pass (no customer-facing copy drift). Otherwise
 * fall back to the describe result. Visible badge text is {@link displayBadge} (operational),
 * aligned with admin/cleaner surfaces; {@link statusLabel} remains for payment/completion copy.
 */
export function customerBookingCardOperationalDisplay(booking: DashboardBooking): {
  statusLabel: CustomerBookingStatusLabel;
  displayBadge: string;
  displayTone: OperationalDisplayTone;
  operationalPhase: BookingOperationalPhase;
  lifecycleSource: "canonical" | "derived";
} {
  const op = describeDashboardBookingOperational(booking);
  const c = booking.raw.canonicalLifecycle;
  const statusLabel = customerBookingStatusLabel(booking);

  if (
    c &&
    c.displayBadge === op.displayBadge &&
    c.operationalPhase === op.operationalPhase &&
    c.displayTone === op.displayTone
  ) {
    return {
      statusLabel,
      displayBadge: c.displayBadge,
      displayTone: c.displayTone,
      operationalPhase: c.operationalPhase,
      lifecycleSource: "canonical",
    };
  }

  return {
    statusLabel,
    displayBadge: op.displayBadge,
    displayTone: op.displayTone,
    operationalPhase: op.operationalPhase,
    lifecycleSource: "derived",
  };
}

/**
 * Operational phase for customer booking **detail** (timeline + header diagnostics).
 * Uses the same display pass as the list/status badge so canonical API parity rules stay aligned.
 */
export function customerBookingDetailOperationalPhase(booking: DashboardBooking): BookingOperationalPhase {
  return customerBookingCardOperationalDisplay(booking).operationalPhase;
}

/**
 * Data attributes for the customer booking detail card header (`/dashboard/bookings/[id]`).
 * Reflects `raw.canonicalLifecycle` when present; on parity mismatch, exposes canonical fields only
 * as diagnostics — visible label/tone/badge stay {@link customerBookingCardOperationalDisplay}.
 */
export function customerBookingDetailHeaderDataAttributes(booking: DashboardBooking): Record<string, string> {
  const card = customerBookingCardOperationalDisplay(booking);
  const c = booking.raw.canonicalLifecycle;
  const op = describeDashboardBookingOperational(booking);
  const attrs: Record<string, string> = {
    "data-detail-operational-phase": card.operationalPhase,
    "data-detail-display-tone": card.displayTone,
    "data-detail-lifecycle-source": card.lifecycleSource,
    "data-detail-display-badge": card.displayBadge,
  };
  if (!c) {
    attrs["data-canonical-lifecycle-present"] = "0";
    return attrs;
  }
  attrs["data-canonical-lifecycle-present"] = "1";
  const mismatch =
    c.operationalPhase !== op.operationalPhase ||
    c.displayBadge !== op.displayBadge ||
    c.displayTone !== op.displayTone;
  if (mismatch) {
    attrs["data-canonical-parity"] = "mismatch";
    attrs["data-canonical-operational-phase"] = c.operationalPhase;
    attrs["data-canonical-display-badge"] = c.displayBadge;
    attrs["data-canonical-display-tone"] = c.displayTone;
  } else {
    attrs["data-canonical-parity"] = "match";
  }
  return attrs;
}

export function customerNotesFromBooking(b: DashboardBooking): string {
  const snap = b.raw.booking_snapshot;
  if (!snap || typeof snap !== "object" || Array.isArray(snap)) return "";
  const notes = (snap as { customer_notes?: unknown }).customer_notes;
  return typeof notes === "string" ? notes.trim() : "";
}
