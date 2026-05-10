import { bookingPaymentRecomputeBlockedByRefund, type BookingPaidSignalRow } from "@/lib/payout/bookingEarningsIntegrity";
import { bookingUsesAccrualPayoutCap, type BookingRowForPayoutCap } from "@/lib/payout/bookingPayoutCapCents";

/**
 * Columns required by {@link bookingPayableForWeeklyBatch} when loading bookings for weekly batching.
 * Keep in sync with `supabase/queries/audit_payout_subsystem_convergence_phase11.sql` (Phase 12 **P8**;
 * Phase 15A **P10** / **P11** / **P11b** mirror the same predicate for measurement-only probes).
 */
export const BOOKING_SELECT_FIELDS_FOR_WEEKLY_BATCH_ELIGIBILITY =
  "id, status, cleaner_id, cleaner_payout_cents, cleaner_bonus_cents, is_test, completed_at, date, billing_type, is_monthly_billing_booking, monthly_invoice_id, payment_status, payout_status, payout_frozen_cents, refunded_at, refund_status";

export type BookingRowForWeeklyBatchEligibility = BookingRowForPayoutCap &
  BookingPaidSignalRow & {
    id?: string;
    status?: string | null;
    cleaner_id?: string | null;
    payout_id?: string | null;
    cleaner_payout_cents?: number | null;
    cleaner_bonus_cents?: number | null;
    payout_frozen_cents?: number | null;
    payout_status?: string | null;
    is_test?: boolean | null;
    completed_at?: string | null;
    date?: string | null;
  };

export type BookingPayableForWeeklyBatchResult = { payable: true } | { payable: false; reason: string };

function normLower(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

/** Prepaid / non-accrual: customer cash-in before weekly cleaner batch. */
function prepaidCustomerPaymentSettledForWeeklyBatch(paymentStatus: string | null | undefined): boolean {
  const p = normLower(paymentStatus);
  if (!p) return false;
  if (p === "pending_monthly") return false;
  return p === "success" || p === "paid" || p === "succeeded";
}

/**
 * Phase 12 — single predicate for whether a **completed** booking may be linked into a weekly
 * `cleaner_payouts` batch (in addition to week window, `payout_id` null, non-test, positive cents).
 *
 * - **Accrual / invoice rail** (`bookingUsesAccrualPayoutCap`): requires linked invoice **paid**,
 *   `payment_status = success`, `payout_status = eligible`, and `payout_frozen_cents` set (settlement path).
 * - **Prepaid / checkout rail**: customer payment settled (`success` | `paid` | `succeeded`, not `pending_monthly`),
 *   no refund block, cleaner payout cents present (also checked by caller).
 *
 * @param invoiceStatusById Map `monthly_invoices.id` → raw `status` (only consulted for accrual rows).
 */
export function bookingPayableForWeeklyBatch(
  row: BookingRowForWeeklyBatchEligibility,
  invoiceStatusById: Map<string, string>,
): BookingPayableForWeeklyBatchResult {
  if (normLower(row.status) !== "completed") {
    return { payable: false, reason: "not_completed" };
  }

  const cp = Number(row.cleaner_payout_cents);
  if (!Number.isFinite(cp) || cp <= 0) {
    return { payable: false, reason: "missing_cleaner_payout_basis" };
  }

  if (bookingPaymentRecomputeBlockedByRefund(row)) {
    return { payable: false, reason: "refund_or_reversal_blocked" };
  }

  const accrual = bookingUsesAccrualPayoutCap(row);

  if (accrual) {
    const invId = String(row.monthly_invoice_id ?? "").trim();
    if (!invId) {
      return { payable: false, reason: "accrual_missing_monthly_invoice" };
    }
    if (!invoiceStatusById.has(invId)) {
      return { payable: false, reason: "monthly_invoice_row_missing" };
    }
    if (normLower(invoiceStatusById.get(invId)) !== "paid") {
      return { payable: false, reason: "monthly_invoice_not_paid" };
    }
    if (normLower(row.payment_status) !== "success") {
      return { payable: false, reason: "monthly_booking_payment_not_success" };
    }
    if (normLower(row.payout_status) !== "eligible") {
      return { payable: false, reason: "monthly_payout_status_not_eligible" };
    }
    if (row.payout_frozen_cents == null || !Number.isFinite(Number(row.payout_frozen_cents))) {
      return { payable: false, reason: "monthly_payout_frozen_missing" };
    }
    return { payable: true };
  }

  if (!prepaidCustomerPaymentSettledForWeeklyBatch(row.payment_status)) {
    return { payable: false, reason: "prepaid_customer_payment_not_settled" };
  }

  return { payable: true };
}
