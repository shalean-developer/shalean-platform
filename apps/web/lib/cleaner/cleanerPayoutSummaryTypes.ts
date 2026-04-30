export type CleanerPayoutSummaryRow = {
  booking_id: string;
  date: string | null;
  /** Job completion timestamp (for Johannesburg calendar bucketing in insights). */
  completed_at?: string | null;
  service: string;
  location: string;
  payout_status: "pending" | "eligible" | "paid" | "invalid";
  payout_frozen_cents: number | null;
  amount_cents: number;
  /** When `payout_status === "paid"` — sole source of truth for payout time (not `bookings.updated_at`). */
  payout_paid_at: string | null;
  payout_run_id: string | null;
  /** Booking is attached to a weekly `cleaner_payouts` row that is frozen or approved (awaiting transfer). */
  in_frozen_batch?: boolean;
  /** Set when paid row is missing `payout_paid_at` (data integrity). */
  __invalid?: boolean;
};

export type CleanerPayoutSummary = {
  pending_cents: number;
  eligible_cents: number;
  paid_cents: number;
  /** Weekly `cleaner_payouts` rows frozen or approved (awaiting disbursement). */
  frozen_batch_cents?: number;
  /** Malformed paid / integrity rows (never folded into pending). */
  invalid_cents?: number;
  /** Completed-job earnings by Johannesburg calendar (from GET /api/cleaner/earnings). */
  today_cents: number;
  week_cents: number;
  month_cents: number;
};
