/**
 * Princess PR D — formal booking refund provider/lifecycle states.
 * Booking columns remain `refund_status` ∈ { partial | full | chargeback | … };
 * provider workflow state lives in `booking_snapshot.refund_workflow`.
 */

export const REFUND_PROVIDER_STATES = [
  "not_requested",
  "requested",
  "approved",
  "submitted_to_provider",
  "pending",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export type RefundProviderState = (typeof REFUND_PROVIDER_STATES)[number];

export type RefundAggregateStatus = "none" | "partial" | "full" | "chargeback";

/** Valid single-request transitions (provider workflow). */
const ALLOWED: Record<RefundProviderState, ReadonlySet<RefundProviderState>> = {
  not_requested: new Set(["requested", "approved", "submitted_to_provider"]),
  requested: new Set(["approved", "cancelled", "failed"]),
  approved: new Set(["submitted_to_provider", "cancelled", "failed"]),
  submitted_to_provider: new Set(["pending", "succeeded", "failed"]),
  pending: new Set(["succeeded", "failed", "pending"]),
  succeeded: new Set(),
  failed: new Set(["submitted_to_provider", "cancelled"]),
  cancelled: new Set(),
};

export const TERMINAL_PROVIDER_STATES: ReadonlySet<RefundProviderState> = new Set([
  "succeeded",
  "cancelled",
]);

export function isRefundProviderState(value: unknown): value is RefundProviderState {
  return typeof value === "string" && (REFUND_PROVIDER_STATES as readonly string[]).includes(value);
}

export function canTransitionRefundProviderState(
  from: RefundProviderState,
  to: RefundProviderState,
): boolean {
  if (from === to && from === "pending") return true;
  return ALLOWED[from]?.has(to) === true;
}

export function assertRefundProviderTransition(
  from: RefundProviderState,
  to: RefundProviderState,
): { ok: true } | { ok: false; error: "invalid_refund_transition" } {
  if (!canTransitionRefundProviderState(from, to)) {
    return { ok: false, error: "invalid_refund_transition" };
  }
  return { ok: true };
}

/**
 * Aggregate booking payment refund label — never "paid" when fully refunded.
 * Presentation uses `refund_status` / refund totals, not `payment_status`.
 */
export function resolveRefundAggregateStatus(params: {
  capturedCents: number;
  refundedCents: number;
  chargeback?: boolean;
}): RefundAggregateStatus {
  if (params.chargeback) return "chargeback";
  const captured = Math.max(0, Math.round(params.capturedCents));
  const refunded = Math.max(0, Math.round(params.refundedCents));
  if (refunded <= 0) return "none";
  if (captured > 0 && refunded >= captured) return "full";
  return "partial";
}

/**
 * Governed `bookings.payment_status` CHECK domain
 * (`bookings_payment_status_check`): pending | success | failed | pending_monthly.
 *
 * MODEL A — immutable capture status: refunds never rewrite this column to
 * `refunded`. Full / partial / chargeback presentation is derived from
 * `refund_status`, `refunded_at`, and refund ledger totals.
 */
export const GOVERNED_BOOKING_PAYMENT_STATUSES = [
  "pending",
  "success",
  "failed",
  "pending_monthly",
] as const;

export type GovernedBookingPaymentStatus = (typeof GOVERNED_BOOKING_PAYMENT_STATUSES)[number];

export function isGovernedBookingPaymentStatus(
  value: unknown,
): value is GovernedBookingPaymentStatus {
  return (
    typeof value === "string" &&
    (GOVERNED_BOOKING_PAYMENT_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Preserve schema-valid capture `payment_status` after refund aggregates.
 * Never returns `refunded` (illegal under `bookings_payment_status_check`).
 */
export function paymentStatusForAggregate(
  _aggregate: RefundAggregateStatus,
  priorPaymentStatus: string | null | undefined,
): string {
  const prior = String(priorPaymentStatus ?? "")
    .trim()
    .toLowerCase();
  if (isGovernedBookingPaymentStatus(prior)) return prior;
  // Legacy / illegal values (e.g. historical "refunded") normalize to capture success.
  return "success";
}
