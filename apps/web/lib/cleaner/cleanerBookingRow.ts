/** Row shape returned by GET `/api/cleaner/jobs` and `/api/cleaner/jobs/[id]`. */
/** Slim wire shape from cleaner APIs / `booking_line_items` join. */
export type CleanerBookingLineItemWire = {
  item_type: string;
  slug: string | null;
  name: string;
  quantity: number;
};

export type CleanerBookingRow = {
  id: string;
  service: string | null;
  /** Catalog slug (`bookings.service_slug`). */
  service_slug?: string | null;
  /** Bedroom count when persisted on the row (mirrors checkout lock). */
  rooms?: number | null;
  /** Bathroom count when persisted on the row. */
  bathrooms?: number | null;
  date: string | null;
  time: string | null;
  location: string | null;
  status: string | null;
  total_paid_zar: number | null;
  total_price?: number | string | null;
  price_breakdown?: Record<string, unknown> | null;
  pricing_version_id?: string | null;
  amount_paid_cents?: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  extras?: unknown[] | null;
  /** When present (cleaner APIs), preferred source for scope copy vs legacy `extras` JSON. */
  lineItems?: CleanerBookingLineItemWire[] | null;
  assigned_at: string | null;
  en_route_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
  booking_snapshot?: unknown | null;
  is_team_job?: boolean | null;
  /** Present for team jobs; individual jobs may still set this when assigned. */
  team_id?: string | null;
  /**
   * For team jobs: usually from `team_member_count_snapshot` (count at assignment — may drift if roster changes).
   * Otherwise computed from `team_members` when snapshot is missing.
   */
  teamMemberCount?: number | null;
  /** Null for team-assigned bookings; UI must not assume a cleaner id exists. */
  cleaner_id?: string | null;
  /** DB `cleaner_response_status` — `accepted` unlocks "On the way". */
  cleaner_response_status?: string | null;
  displayEarningsCents?: number | null;
  /** True when pay is the team-job placeholder until stored display earnings exist. */
  displayEarningsIsEstimate?: boolean;
  earnings_cents?: number | null;
  earnings_estimated?: boolean;
  payout_status?: string | null;
  payout_paid_at?: string | null;
  payout_frozen_cents?: number | null;
  /** True when this cleaner has at least one row in `cleaner_job_issue_reports` for this booking. */
  cleaner_has_issue_report?: boolean;
  /** Snapshot-derived; added by cleaner jobs API for clients. */
  duration_hours?: number | null;
  job_notes?: string | null;
  service_name?: string | null;
  service_type?: string | null;
};
