/**
 * Row shape for GET /api/admin/bookings and the admin bookings list UI.
 */
export type AdminBookingsListRow = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  service: string | null;
  /** Catalog slug when present — used for deep/move team-job detection on list cards. */
  service_slug?: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  total_paid_zar: number | null;
  amount_paid_cents: number | null;
  /** Quoted visit total (ZAR) when not yet in paid columns — used for admin payout estimates. */
  total_price?: number | null;
  base_amount_cents?: number | null;
  service_fee_cents?: number | null;
  cleaner_payout_cents?: number | null;
  cleaner_bonus_cents?: number | null;
  /** Team / roster model: pool shown to cleaners (admin list uses with team payout helper). */
  display_earnings_cents?: number | null;
  cleaner_earnings_total_cents?: number | null;
  company_revenue_cents?: number | null;
  payout_percentage?: number | null;
  payout_type?: string | null;
  is_test?: boolean | null;
  status: string | null;
  /** From `bookings.cleaner_response_status` when included on list select (canonical ops). */
  cleaner_response_status?: string | null;
  accepted_at?: string | null;
  is_recurring_generated?: boolean | null;
  /** Booking `billing_type` when selected (recurring vs checkout). */
  billing_type?: string | null;
  payment_completed_at?: string | null;
  payout_status?: string | null;
  payout_paid_at?: string | null;
  admin_recurring_unpaid_completion_override_at?: string | null;
  admin_recurring_unpaid_completion_override_by?: string | null;
  dispatch_status: "searching" | "offered" | "assigned" | "failed" | "no_cleaner" | "unassignable" | null;
  surge_multiplier?: number | null;
  surge_reason?: string | null;
  user_id: string | null;
  cleaner_id: string | null;
  selected_cleaner_id?: string | null;
  assignment_type?: string | null;
  fallback_reason?: string | null;
  attempted_cleaner_id?: string | null;
  became_pending_at?: string | null;
  assigned_at: string | null;
  en_route_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  paystack_reference: string;
  duration_minutes?: number | null;
  dispatch_attempt_count?: number | null;
  payment_needs_follow_up?: boolean | null;
  payment_link_send_count?: number | null;
  payment_conversion_seconds?: number | null;
  payment_conversion_bucket?: string | null;
  payment_status?: string | null;
  monthly_invoice_id?: string | null;
  customer_billing_type?: string | null;
  customer_schedule_type?: string | null;
  admin_force_slot_override?: boolean | null;
  team_id?: string | null;
  is_team_job?: boolean | null;
  /** Roster size at team assignment (canonical team total = per-cleaner × snapshot). */
  team_member_count_snapshot?: number | null;
  team?: { id: string; name: string | null } | null;
  booking_cleaners?: Array<{ cleaner_id: string; full_name: string | null; role: string }>;
};
