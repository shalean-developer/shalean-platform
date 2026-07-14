/**
 * Canonical booking payment settlement semantics (BK-001 / Phase A ADR).
 *
 * - `payment_status` is the authoritative settlement state.
 * - Collected-cash columns (`amount_paid_cents`, `total_paid_*`) represent money
 *   actually collected — never “amount due”.
 * - Positive cash on `pending_payment` / `payment_expired` is a data anomaly,
 *   not proof of settlement.
 */

import { resolveTotalPaidCents } from "@/lib/payout/calculateCleanerPayout";

/** Payment statuses that mean the customer obligation is settled. */
export const AUTHORITATIVE_SETTLED_PAYMENT_STATUSES = new Set([
  "success",
  "paid",
  "succeeded",
  "pending_monthly",
  "completed",
]);

const UNSETTLED_BOOKING_STATUSES = new Set(["pending_payment", "payment_expired"]);

export type BookingSettlementSignalRow = {
  payment_status?: string | null;
  status?: string | null;
  payment_completed_at?: string | null;
  paid_at?: string | null;
  amount_paid_cents?: number | null;
  total_paid_cents?: number | null;
  total_paid_zar?: number | null;
};

export function bookingHasAuthoritativeSettledPaymentStatus(
  paymentStatus: string | null | undefined,
): boolean {
  return AUTHORITATIVE_SETTLED_PAYMENT_STATUSES.has(
    String(paymentStatus ?? "")
      .trim()
      .toLowerCase(),
  );
}

export function bookingStatusBlocksCashAsSettlementEvidence(
  status: string | null | undefined,
): boolean {
  return UNSETTLED_BOOKING_STATUSES.has(
    String(status ?? "")
      .trim()
      .toLowerCase(),
  );
}

function collectedCashCentsPositive(row: BookingSettlementSignalRow): boolean {
  return resolveTotalPaidCents(row.total_paid_zar, row.total_paid_cents ?? row.amount_paid_cents) > 0;
}

/**
 * Settlement-sensitive paid check for recovery, ops gates, and admin edit paid-safe paths.
 *
 * Compatibility: historical rows may lack `payment_status` but still hold real cash after
 * leaving pending_payment. Positive cents alone never settle a pending/expired row.
 */
export function bookingIsCustomerPaymentSettled(row: BookingSettlementSignalRow): boolean {
  if (bookingHasAuthoritativeSettledPaymentStatus(row.payment_status)) return true;

  const completedAt = row.payment_completed_at ?? row.paid_at;
  if (completedAt != null && String(completedAt).trim() !== "") {
    if (!bookingStatusBlocksCashAsSettlementEvidence(row.status)) return true;
  }

  if (bookingStatusBlocksCashAsSettlementEvidence(row.status)) return false;

  return collectedCashCentsPositive(row);
}

/**
 * True when a pending/expired row has positive collected-cash columns (anomaly metric).
 */
export function bookingHasPendingCollectedCashAnomaly(row: BookingSettlementSignalRow): boolean {
  return bookingStatusBlocksCashAsSettlementEvidence(row.status) && collectedCashCentsPositive(row);
}
