/**
 * ## Persist eligibility for `persistCleanerPayoutIfUnset`
 *
 * **Two intentional modes** (product architecture — do not collapse without migrating callers):
 *
 * | Mode | When | Why |
 * |------|------|-----|
 * | **completed** | `status` / `completed_at` say the job finished | Completion gates (cleaner/admin/cron), weekly batch, repairs |
 * | **pre-completion assignment basis** | Paid solo notify gate, invoice-backed solo/team, assigned team rows | Persist display / hybrid columns **before** service completes so cleaners see earnings parity |
 *
 * This module is **read-only policy** plus stable skip reasons; it does not mutate bookings.
 *
 * @module bookingPayoutPersistEligibility
 */

import { isAuthoritativeBookingCompleted } from "@/lib/booking/deriveBookingOperationalPhase";
import {
  bookingPaidCustomerSignalsPresent,
  bookingRequiresPersistedEarningsBeforeCleanerNotify,
} from "@/lib/payout/adminBookingAssignmentEarningsGate";
import { bookingPaymentRecomputeBlockedByRefund, type BookingPaidSignalRow } from "@/lib/payout/bookingEarningsIntegrity";

export type PayoutPersistEligibility =
  | { allowed: true; mode: "completed" | "pre_completion_assignment_basis" }
  | { allowed: false; skipReason: string };

/** Skip reasons from {@link evaluatePersistCleanerPayoutEligibility} — bypass post-skip “display missing” escalation in `persistCleanerPayoutIfUnset`. */
export function isPayoutEligibilitySkipReason(skipReason: string | undefined): boolean {
  return typeof skipReason === "string" && skipReason.startsWith("payout_eligibility_");
}

function normStatus(row: Record<string, unknown>): string {
  return String(row.status ?? "").trim().toLowerCase();
}

function invoiceBackedRow(row: Record<string, unknown>): boolean {
  if (row.is_monthly_billing_booking === true) return true;
  const mid = row.monthly_invoice_id;
  if (mid != null && String(mid).trim() !== "") return true;
  const bt = String(row.billing_type ?? "").trim().toLowerCase();
  return bt === "monthly_contract" || bt === "recurring_invoice";
}

const DISPATCH_FUNNEL_BOOKING_STATUS = new Set(["pending_assignment", "offered"]);

/**
 * Central gate for whether `persistCleanerPayoutIfUnsetCore` should run writes for this row snapshot.
 * Callers pass the same shape loaded via {@link bookingsPersistSelectListForPersist}.
 */
export function evaluatePersistCleanerPayoutEligibility(row: Record<string, unknown>): PayoutPersistEligibility {
  const st = normStatus(row);
  const paidRow = row as BookingPaidSignalRow;

  if (st === "cancelled" || st === "failed" || st === "payment_expired") {
    return { allowed: false, skipReason: "payout_eligibility_terminal_booking" };
  }

  if (st === "pending_payment") {
    if (!invoiceBackedRow(row)) {
      return { allowed: false, skipReason: "payout_eligibility_pending_payment" };
    }
  }

  if (row.payment_needs_follow_up === true && !invoiceBackedRow(row)) {
    return { allowed: false, skipReason: "payout_eligibility_payment_follow_up" };
  }

  if (bookingPaymentRecomputeBlockedByRefund(paidRow)) {
    return { allowed: false, skipReason: "payout_eligibility_refund_or_reversal" };
  }

  if (isAuthoritativeBookingCompleted(row as { status?: string | null; completed_at?: string | null })) {
    return { allowed: true, mode: "completed" };
  }

  if (DISPATCH_FUNNEL_BOOKING_STATUS.has(st)) {
    return { allowed: false, skipReason: "payout_eligibility_dispatch_booking_status" };
  }

  /**
   * Active assignment: cleaner is on the job (or en route / started). Persist display
   * earnings here so completion and dashboards do not depend on payment columns having
   * landed before the service window — {@link isCompleatableDisplayEarningsCents} still
   * blocks R0 completion when there is no real payout basis.
   */
  if (st === "assigned" || st === "in_progress") {
    return { allowed: true, mode: "pre_completion_assignment_basis" };
  }

  const isTeam = row.is_team_job === true;

  if (!isTeam && invoiceBackedRow(row)) {
    return { allowed: true, mode: "pre_completion_assignment_basis" };
  }

  if (bookingRequiresPersistedEarningsBeforeCleanerNotify(row as never)) {
    return { allowed: true, mode: "pre_completion_assignment_basis" };
  }

  if (isTeam) {
    const teamId = String(row.team_id ?? "").trim();
    if (!teamId) {
      return { allowed: false, skipReason: "payout_eligibility_team_missing_team_id" };
    }
    const assignmentLike =
      st === "assigned" ||
      st === "in_progress" ||
      st === "" ||
      (st === "pending_payment" && invoiceBackedRow(row));
    if (!assignmentLike) {
      return { allowed: false, skipReason: "payout_eligibility_team_status_not_assigned" };
    }
    if (!invoiceBackedRow(row) && !bookingPaidCustomerSignalsPresent(paidRow)) {
      return { allowed: false, skipReason: "payout_eligibility_team_unpaid" };
    }
    return { allowed: true, mode: "pre_completion_assignment_basis" };
  }

  if (st === "pending") {
    if (!bookingRequiresPersistedEarningsBeforeCleanerNotify(row as never)) {
      return { allowed: false, skipReason: "payout_eligibility_pending_without_basis" };
    }
    return { allowed: true, mode: "pre_completion_assignment_basis" };
  }

  return { allowed: false, skipReason: "payout_eligibility_requires_completed_or_basis" };
}

/** Diagnostics for logs / tests — mirrors {@link evaluatePersistCleanerPayoutEligibility}. */
export function explainPersistCleanerPayoutEligibility(row: Record<string, unknown>): {
  eligibility: PayoutPersistEligibility;
  summary: string;
} {
  const eligibility = evaluatePersistCleanerPayoutEligibility(row);
  const summary = eligibility.allowed
    ? `allowed:${eligibility.mode}`
    : `blocked:${eligibility.skipReason}`;
  return { eligibility, summary };
}
