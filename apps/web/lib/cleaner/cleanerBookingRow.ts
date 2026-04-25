/** Row shape returned by GET `/api/cleaner/jobs` and `/api/cleaner/jobs/[id]`. */
export type CleanerBookingRow = {
  id: string;
  service: string | null;
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
  displayEarningsCents?: number | null;
  payout_id?: string | null;
};
