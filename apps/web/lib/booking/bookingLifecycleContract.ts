import type { BookingOperationalPhase } from "@/lib/booking/deriveBookingOperationalPhase";
import type { LifecycleCapabilities, OperationalDisplayTone } from "@/lib/booking/describeBookingOperationalState";

/**
 * Cheap, viewer-independent bundle attached to customer (`canonicalLifecycle.dashboardAlignment`),
 * cleaner (`dashboardLifecycle`), and admin (`dashboardLifecycle`) payloads — same row ⇒ same values.
 */
export type DashboardLifecycleAlignmentWire = {
  operationalPhase: BookingOperationalPhase;
  /** Assignment funnel semantics from {@link import("@/lib/dispatch/assignmentLifecycleContract").deriveAssignmentSemanticPhase}. */
  assignmentSemanticPhase: string;
  hasEffectiveAssignee: boolean;
  paymentNeedsFollowUp: boolean;
  assignmentType: string | null;
  fallbackReason: string | null;
};

/**
 * Cross-dashboard lifecycle surface: same operational truth for admin / customer / cleaner UIs.
 * Viewer-specific affordances stay in {@link LifecycleCapabilities} on the full describe result;
 * this contract carries the shared fields only plus coarse assignment/schedule labels.
 */
export type CanonicalBookingLifecycleAllowedActions = LifecycleCapabilities;

export type CanonicalBookingScheduleState = "missing" | "scheduled";

/** Coarse assignment lens derived from phase + row (not a second lifecycle engine). */
export type CanonicalCleanerAssignmentState =
  | "unassigned"
  | "assigned_pending_accept"
  | "accepted"
  | "en_route"
  | "in_job"
  | "done"
  | "unknown";

export type CanonicalBookingLifecycleSurface = {
  bookingId: string;
  status: string;
  operationalPhase: BookingOperationalPhase;
  paymentState: string;
  cleanerAssignmentState: CanonicalCleanerAssignmentState;
  scheduleState: CanonicalBookingScheduleState;
  recurringState: string;
  payoutState: "n_a" | "pending" | "eligible" | "paid" | "invalid";
  allowedActions: CanonicalBookingLifecycleAllowedActions;
  displayBadge: string;
  displayTone: OperationalDisplayTone;
  /** Same fields as cleaner/admin `dashboardLifecycle` for cross-surface parity tests and clients. */
  dashboardAlignment: DashboardLifecycleAlignmentWire;
};

export function scheduleStateFromBookingRow(row: Record<string, unknown>): CanonicalBookingScheduleState {
  const d = String(row.date ?? "").trim();
  const t = String(row.time ?? "").trim();
  if (!d || !t) return "missing";
  return "scheduled";
}

export function cleanerAssignmentStateFromBookingRow(
  row: Record<string, unknown>,
  operationalPhase: BookingOperationalPhase,
): CanonicalCleanerAssignmentState {
  const st = String(row.status ?? "").trim().toLowerCase();
  if (st === "cancelled" || st === "failed") return "done";
  if (operationalPhase === "completed" || operationalPhase === "cancelled" || operationalPhase === "failed") return "done";
  if (operationalPhase === "active") return "in_job";
  if (operationalPhase === "travelling") return "en_route";
  if (operationalPhase === "accepted") return "accepted";
  if (operationalPhase === "assigned") return "assigned_pending_accept";
  if (operationalPhase === "pending" || operationalPhase === "expired") return "unassigned";
  if (operationalPhase === "pending_payment" || operationalPhase === "pending_payment_recurring") {
    const hasCleaner = Boolean(String(row.cleaner_id ?? "").trim());
    const team = row.is_team_job === true && Boolean(String(row.team_id ?? "").trim());
    if (hasCleaner || team) return "assigned_pending_accept";
    return "unassigned";
  }
  if (operationalPhase === "unknown") return "unknown";
  return "unknown";
}
