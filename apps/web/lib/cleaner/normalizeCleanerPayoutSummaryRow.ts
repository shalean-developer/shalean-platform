import { isBookingPayoutPaid } from "@/lib/cleaner/cleanerPayoutPaid";
import type { CleanerPayoutSummaryRow } from "@/lib/cleaner/cleanerPayoutSummaryTypes";

export type NormalizeCleanerPayoutSummaryRowInput = {
  booking_id: string;
  date: string | null;
  service: string;
  location: string;
  payout_status: unknown;
  payout_paid_at: unknown;
  payout_run_id: unknown;
  payout_frozen_cents: unknown;
  amount_cents: number;
};

/**
 * Single normalization path for cleaner-facing payout rows (API + client cache).
 * Malformed `paid` without `payout_paid_at` becomes `invalid` — never coerced to `pending`.
 */
export function normalizeCleanerPayoutSummaryRow(
  input: NormalizeCleanerPayoutSummaryRowInput,
  opts?: { onPaidRowMissingTimestamp?: (bookingId: string) => void },
): CleanerPayoutSummaryRow {
  const s = String(input.payout_status ?? "")
    .trim()
    .toLowerCase();

  let payout_status: CleanerPayoutSummaryRow["payout_status"];
  let __invalid: boolean | undefined;

  if (s === "eligible") {
    payout_status = "eligible";
  } else if (s === "paid") {
    if (isBookingPayoutPaid({ payout_status: input.payout_status, payout_paid_at: input.payout_paid_at })) {
      payout_status = "paid";
    } else {
      opts?.onPaidRowMissingTimestamp?.(input.booking_id);
      payout_status = "invalid";
      __invalid = true;
    }
  } else if (s === "pending") {
    payout_status = "pending";
  } else if (s === "invalid") {
    payout_status = "invalid";
    __invalid = true;
  } else {
    payout_status = "pending";
  }

  const payout_paid_at =
    payout_status === "paid" && typeof input.payout_paid_at === "string" && input.payout_paid_at.trim()
      ? input.payout_paid_at.trim()
      : null;
  const payout_run_id =
    payout_status === "paid" && input.payout_run_id != null && String(input.payout_run_id).trim()
      ? String(input.payout_run_id).trim()
      : null;

  return {
    booking_id: input.booking_id,
    date: input.date,
    service: input.service,
    location: input.location,
    payout_status,
    payout_frozen_cents:
      input.payout_frozen_cents != null ? Math.round(Number(input.payout_frozen_cents)) : null,
    amount_cents: Math.max(0, Math.round(Number(input.amount_cents) || 0)),
    payout_paid_at,
    payout_run_id,
    __invalid,
  };
}
