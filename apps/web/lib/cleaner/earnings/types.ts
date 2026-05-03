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
  is_team_job?: boolean;
};

export type EarningsPeriod = "today" | "week" | "month";
