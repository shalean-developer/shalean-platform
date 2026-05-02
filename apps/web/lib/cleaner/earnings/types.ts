/** Wire shape for `GET /api/cleaner/earnings` `rows[]` (client + server aligned). */
export type CleanerEarningsRowWire = {
  booking_id: string;
  date: string | null;
  completed_at: string | null;
  service: string;
  location: string;
  payout_status: string;
  payout_frozen_cents: number | null;
  amount_cents: number;
  payout_paid_at: string | null;
  payout_run_id: string | null;
  in_frozen_batch?: boolean;
  __invalid?: boolean;
  /** Booking lifecycle status (earnings list is completed jobs today). */
  booking_status?: string | null;
  /** Customer total paid for the booking when known (ZAR cents). */
  customer_paid_cents?: number | null;
  /** `customer_paid_cents - amount_cents` when customer total known; remainder to platform. */
  platform_fee_cents?: number | null;
  /** Future: explicit processor fee from pricing snapshot (not yet on wire). */
  payment_processor_fee_cents?: number | null;
  /** Future: tips attributed to cleaner (not yet on wire). */
  tips_cents?: number | null;
  is_team_job?: boolean;
};

export type EarningsPeriod = "today" | "week" | "month";
