import type {
  CanonicalBookingLifecycleSurface,
  DashboardLifecycleAlignmentWire,
} from "@/lib/booking/bookingLifecycleContract";
import {
  cleanerAssignmentStateFromBookingRow,
  scheduleStateFromBookingRow,
} from "@/lib/booking/bookingLifecycleContract";
import { deriveBookingOperationalPhase } from "@/lib/booking/deriveBookingOperationalPhase";
import {
  describeBookingOperationalState,
  phaseRowFromBookingRecord,
  type DescribeBookingOperationalStateInput,
} from "@/lib/booking/describeBookingOperationalState";
import {
  bookingHasEffectiveAssignee,
  deriveAssignmentSemanticPhase,
} from "@/lib/dispatch/assignmentLifecycleContract";

export type BookingReadModelOptions = Pick<
  DescribeBookingOperationalStateInput,
  "nowMs" | "telemetryBookingId" | "clientHints"
> & {
  pendingDispatchOfferCount?: number;
};

function trimStr(v: unknown): string | null {
  const s = v == null ? "" : String(v).trim();
  return s || null;
}

/**
 * Viewer-independent lifecycle bundle for dashboards — O(row): no viewer branching.
 * Prefer this over re-parsing raw `bookings.status` in API handlers.
 */
export function buildDashboardLifecycleAlignmentWire(
  row: Record<string, unknown>,
  opts?: BookingReadModelOptions,
): DashboardLifecycleAlignmentWire {
  const telemetryBookingId = opts?.telemetryBookingId?.trim() || undefined;
  const operationalPhase = deriveBookingOperationalPhase(phaseRowFromBookingRecord(row), {
    telemetryBookingId,
  });
  const pending = opts?.pendingDispatchOfferCount;
  return {
    operationalPhase,
    assignmentSemanticPhase: deriveAssignmentSemanticPhase(row, {
      pendingDispatchOfferCount: typeof pending === "number" ? pending : undefined,
    }),
    hasEffectiveAssignee: bookingHasEffectiveAssignee(row),
    paymentNeedsFollowUp: row.payment_needs_follow_up === true,
    assignmentType: trimStr(row.assignment_type),
    fallbackReason: trimStr(row.fallback_reason),
  };
}

/**
 * Maps a raw `bookings` row + viewer to the canonical lifecycle contract.
 * `operationalPhase` / `dashboardAlignment` use the same derivation as cleaner + admin `dashboardLifecycle`.
 */
export function toCanonicalBookingLifecycleSurface(
  row: Record<string, unknown>,
  viewer: DescribeBookingOperationalStateInput["viewer"],
  opts?: BookingReadModelOptions,
): CanonicalBookingLifecycleSurface {
  const dashboardAlignment = buildDashboardLifecycleAlignmentWire(row, opts);
  const op = describeBookingOperationalState({
    row,
    viewer,
    nowMs: opts?.nowMs,
    telemetryBookingId: opts?.telemetryBookingId,
    clientHints: opts?.clientHints,
  });
  if (process.env.NODE_ENV !== "production" && op.operationalPhase !== dashboardAlignment.operationalPhase) {
    console.warn("[toCanonicalBookingLifecycleSurface] operationalPhase mismatch", {
      bookingId: row.id,
      describePhase: op.operationalPhase,
      alignmentPhase: dashboardAlignment.operationalPhase,
    });
  }
  const bookingId = String(row.id ?? "").trim();
  return {
    bookingId,
    status: String(row.status ?? ""),
    operationalPhase: dashboardAlignment.operationalPhase,
    paymentState: op.paymentState,
    cleanerAssignmentState: cleanerAssignmentStateFromBookingRow(row, dashboardAlignment.operationalPhase),
    scheduleState: scheduleStateFromBookingRow(row),
    recurringState: op.recurringState,
    payoutState: op.payoutState,
    allowedActions: { ...op.lifecycleCapabilities },
    displayBadge: op.displayBadge,
    displayTone: op.displayTone,
    dashboardAlignment,
  };
}
