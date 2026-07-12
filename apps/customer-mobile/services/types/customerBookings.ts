/**
 * Subset of customer booking row fields needed for list/detail/modify UI.
 * Shapes match `GET /api/customer/bookings` / `GET /api/customer/bookings/:id`.
 * Display only — server owns pricing and lifecycle writes.
 */

export type CustomerBookingRow = {
  id: string;
  status: string | null;
  date: string | null;
  time: string | null;
  service: string | null;
  service_slug?: string | null;
  location: string | null;
  suburb?: string | null;
  display_cleaner_name?: string | null;
  payout_owner_cleaner_name?: string | null;
  cleaner_id?: string | null;
  payout_owner_cleaner_id?: string | null;
  is_team_job?: boolean | null;
  team_id?: string | null;
  cleaners?: { full_name: string | null; phone: string | null } | null;
  total_price?: number | string | null;
  total_paid_zar?: number | null;
  amount_paid_cents?: number | null;
  duration_minutes?: number | null;
  started_at?: string | null;
  en_route_at?: string | null;
  completed_at?: string | null;
  monthly_invoice_id?: string | null;
  payment_status?: string | null;
  is_monthly_billing_booking?: boolean | null;
  service_details?: Record<string, unknown> | null;
  selected_extras?: string[] | null;
  pricing_summary?: unknown;
  rooms?: number | string | null;
  bathrooms?: number | string | null;
  extras?: string[] | null;
  booking_snapshot?: Record<string, unknown> | null;
  access_instructions?: string | null;
  parking_instructions?: string | null;
  gate_code?: string | null;
  booking_type?: string | null;
  booking_reference?: string | null;
  paystack_reference?: string | null;
  customer_email?: string | null;
  schedule_confirmed?: boolean | null;
};

export type CustomerBookingsListResponse = {
  bookings: CustomerBookingRow[];
};

export type CustomerBookingDetailResponse = {
  booking: CustomerBookingRow;
};

export type RecurringPlanRow = {
  id: string;
  frequency: string;
  days_of_week: number[];
  start_date: string | null;
  end_date: string | null;
  price: number;
  status: string;
  next_run_date: string;
  skip_next_occurrence_date: string | null;
  monthly_pattern: string;
  monthly_nth: number | null;
  template_visit_date?: string | null;
  template_visit_time?: string | null;
  template_location?: string | null;
  template_service_label?: string | null;
  upcoming_bookings?: Array<{
    id: string;
    date: string | null;
    time: string | null;
    status: string | null;
    payment_status?: string | null;
  }>;
};

export type RecurringListResponse = {
  ok?: boolean;
  items: RecurringPlanRow[];
  activePlanCount?: number;
};
