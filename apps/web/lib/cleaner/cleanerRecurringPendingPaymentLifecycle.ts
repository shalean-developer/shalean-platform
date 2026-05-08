import { bookingMatchesRecurringCleanerPendingPayment } from "@/lib/cleaner/cleanerBookingAccess";

/** Lifecycle POST actions for recurring unpaid policy checks. */
export type RecurringPendingLifecycleAction = "accept" | "reject" | "en_route" | "start" | "complete";

/**
 * `pending_payment` row that matches recurring cleaner visibility (same signals as list filter).
 */
export function bookingIsRecurringPendingPayment(row: Record<string, unknown>): boolean {
  const st = String(row.status ?? "").trim().toLowerCase();
  return st === "pending_payment" && bookingMatchesRecurringCleanerPendingPayment(row);
}

/**
 * Canonical policy: recurring unpaid visits stay visible and schedulable; accept/decline roster intent is allowed;
 * travel / execution / completion stay locked until `status` leaves `pending_payment` (payment or invoice path).
 */
export function recurringPendingPaymentLifecycleAllowsAction(
  action: RecurringPendingLifecycleAction,
  row: Record<string, unknown>,
): { allowed: true } | { allowed: false; reason: "one_time_pending_payment" | "recurring_pending_payment_progression" } {
  const st = String(row.status ?? "").trim().toLowerCase();
  if (st !== "pending_payment") return { allowed: true };
  if (!bookingMatchesRecurringCleanerPendingPayment(row)) {
    return { allowed: false, reason: "one_time_pending_payment" };
  }
  if (action === "accept" || action === "reject") return { allowed: true };
  return { allowed: false, reason: "recurring_pending_payment_progression" };
}

/** Canonical alias for product docs / grep — same as {@link recurringPendingPaymentLifecycleAllowsAction}. */
export const isCleanerLifecycleAllowedForRecurringPendingPayment = recurringPendingPaymentLifecycleAllowsAction;

/** Cleaner-facing copy when travel/start/complete are blocked for recurring unpaid. */
export function recurringPendingPaymentProgressionBlockedMessage(): string {
  return "This visit is still awaiting customer or invoice payment. You can accept or decline it, but travel, start, and complete stay locked until payment is confirmed.";
}
