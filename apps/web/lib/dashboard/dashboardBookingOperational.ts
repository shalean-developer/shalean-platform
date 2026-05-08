import type { DashboardBooking } from "@/lib/dashboard/types";
import {
  describeBookingOperationalState,
  type DescribeBookingOperationalStateResult,
} from "@/lib/booking/describeBookingOperationalState";
import type { BookingOperationalPhase } from "@/lib/booking/deriveBookingOperationalPhase";
import { isAuthoritativeBookingCompleted } from "@/lib/booking/deriveBookingOperationalPhase";

/** Maps a dashboard booking to a `bookings`-shaped record for {@link describeBookingOperationalState}. */
export function dashboardBookingToOperationalRecord(b: DashboardBooking): Record<string, unknown> {
  const r = b.raw;
  return {
    ...r,
    /** Raw DB status — normalized `b.status` drops values like `pending_payment`. */
    status: r.status ?? b.status,
  };
}

/** Customer dashboard surfaces use admin operational derivation so lifecycle phase matches internal truth. */
export function describeDashboardBookingOperational(b: DashboardBooking) {
  return describeBookingOperationalState({
    row: dashboardBookingToOperationalRecord(b),
    viewer: "admin",
  });
}

/** Same completion rule as cleaner/admin (`status` or `completed_at`). */
export function isDashboardBookingAuthoritativelyCompleted(b: DashboardBooking): boolean {
  return isAuthoritativeBookingCompleted({
    status: b.raw.status ?? b.status,
    completed_at: b.raw.completed_at,
  });
}

const CUSTOMER_MODIFY_PHASES = new Set<BookingOperationalPhase>(["pending", "assigned", "accepted"]);

function canCustomerModifyFromOperational(b: DashboardBooking, op: DescribeBookingOperationalStateResult): boolean {
  if (["completed", "cancelled", "failed"].includes(op.operationalPhase)) return false;
  if (op.operationalPhase === "pending_payment" || op.operationalPhase === "pending_payment_recurring") return false;
  if (op.operationalPhase === "expired") return false;
  if (op.operationalPhase === "active" || op.operationalPhase === "travelling") return false;
  const row = dashboardBookingToOperationalRecord(b);
  if (String(row.en_route_at ?? "").trim() || String(row.started_at ?? "").trim()) return false;
  return CUSTOMER_MODIFY_PHASES.has(op.operationalPhase);
}

export type DashboardBookingCustomerSurface = {
  operational: DescribeBookingOperationalStateResult;
  modifiable: boolean;
  showRebook: boolean;
};

/** Single describe pass for customer dashboard cards (modify / rebook / phase). */
export function dashboardBookingCustomerSurface(b: DashboardBooking): DashboardBookingCustomerSurface {
  const operational = describeDashboardBookingOperational(b);
  return {
    operational,
    modifiable: canCustomerModifyFromOperational(b, operational),
    showRebook: operational.operationalPhase === "completed" || operational.operationalPhase === "cancelled",
  };
}

/**
 * Reschedule/cancel eligibility: not terminal, job not travelling/active, unpaid-checkout visits excluded,
 * and coarse phase is still pre-fieldwork.
 */
export function canCustomerModifyDashboardBooking(b: DashboardBooking): boolean {
  return canCustomerModifyFromOperational(b, describeDashboardBookingOperational(b));
}

/**
 * Customer booking detail timeline: "Confirmed" means past dispatch-pending / expired-offer limbo
 * (aligned with {@link describeDashboardBookingOperational} / admin cleaner surfaces).
 */
export function customerBookingDetailTimelineConfirmedDone(b: DashboardBooking): boolean {
  const phase = describeDashboardBookingOperational(b).operationalPhase;
  return phase !== "pending" && phase !== "expired";
}
