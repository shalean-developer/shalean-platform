export type CleanerPayoutSummaryRow = {
  booking_id: string;
  date: string | null;
  service: string;
  location: string;
  payout_status: "pending" | "eligible" | "paid" | "invalid";
  payout_frozen_cents: number | null;
  amount_cents: number;
  /** When `payout_status === "paid"` — sole source of truth for payout time (not `bookings.updated_at`). */
  payout_paid_at: string | null;
  payout_run_id: string | null;
  /** Set when paid row is missing `payout_paid_at` (data integrity). */
  __invalid?: boolean;
};

export type CleanerPayoutSummary = {
  pending_cents: number;
  eligible_cents: number;
  paid_cents: number;
  /** Malformed paid / integrity rows (never folded into pending). */
  invalid_cents?: number;
  /** Completed-job earnings by Johannesburg calendar (from GET /api/cleaner/earnings). */
  today_cents: number;
  week_cents: number;
  month_cents: number;
};
