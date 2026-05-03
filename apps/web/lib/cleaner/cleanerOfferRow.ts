/** Row from GET `/api/cleaner/offers` (pending dispatch offers). */
export type CleanerOfferRow = {
  id: string;
  booking_id: string;
  cleaner_id: string;
  /** Public token for `/offer/{offer_token}` (matches `dispatch_offers.offer_token`). */
  offer_token?: string;
  /** Set when offer SMS was persisted successfully; null if not sent yet or send failed. */
  sms_sent_at?: string | null;
  status: string;
  expires_at: string;
  created_at: string;
  /** Server-assigned A/B cell; null on legacy rows. */
  ux_variant?: string | null;
  displayEarningsCents?: number | null;
  displayEarningsIsEstimate?: boolean;
  /** Mirrors `displayEarningsCents` (API contract). */
  earnings_cents?: number | null;
  /** Mirrors `displayEarningsIsEstimate`. */
  earnings_estimated?: boolean;
  booking: {
    id: string;
    service: string | null;
    date: string | null;
    time: string | null;
    location: string | null;
    customer_name: string | null;
    customer_phone: string | null;
    status: string | null;
    total_paid_zar?: number | null;
    total_price?: number | string | null;
    amount_paid_cents?: number | null;
    is_team_job?: boolean;
    team_id?: string | null;
    /** From `team_member_count_snapshot` when present. */
    teamMemberCount?: number | null;
    booking_snapshot?: unknown | null;
  } | null;
};
