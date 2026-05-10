import type { CanonicalBookingLifecycleSurface } from "@/lib/booking/bookingLifecycleContract";
import {
  cleanerAssignmentStateFromBookingRow,
  scheduleStateFromBookingRow,
} from "@/lib/booking/bookingLifecycleContract";
import {
  describeBookingOperationalState,
  type DescribeBookingOperationalStateInput,
} from "@/lib/booking/describeBookingOperationalState";

export type BookingReadModelOptions = Pick<
  DescribeBookingOperationalStateInput,
  "nowMs" | "telemetryBookingId" | "clientHints"
>;

/**
 * Maps a raw `bookings` row + viewer to the canonical lifecycle contract.
 * All dashboards should converge on this for phase/payment/recurring/payout truth.
 */
export function toCanonicalBookingLifecycleSurface(
  row: Record<string, unknown>,
  viewer: DescribeBookingOperationalStateInput["viewer"],
  opts?: BookingReadModelOptions,
): CanonicalBookingLifecycleSurface {
  const op = describeBookingOperationalState({
    row,
    viewer,
    nowMs: opts?.nowMs,
    telemetryBookingId: opts?.telemetryBookingId,
    clientHints: opts?.clientHints,
  });
  const bookingId = String(row.id ?? "").trim();
  return {
    bookingId,
    status: String(row.status ?? ""),
    operationalPhase: op.operationalPhase,
    paymentState: op.paymentState,
    cleanerAssignmentState: cleanerAssignmentStateFromBookingRow(row, op.operationalPhase),
    scheduleState: scheduleStateFromBookingRow(row),
    recurringState: op.recurringState,
    payoutState: op.payoutState,
    allowedActions: { ...op.lifecycleCapabilities },
    displayBadge: op.displayBadge,
    displayTone: op.displayTone,
  };
}
