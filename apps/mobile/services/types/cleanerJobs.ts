/** Wire types for cleaner job APIs — mirrors server responses without importing Next.js. */

export type CleanerBookingLineItemWire = {
  item_type: string;
  slug: string | null;
  name: string;
  quantity: number;
};

export type ServiceQaCleanerWire = {
  sections: string[];
  section_labels: Record<string, string>;
  checklist: Array<{
    section_key: string;
    completed: boolean;
    completed_at: string | null;
    notes: string | null;
  }>;
  photos: Array<{
    id: string;
    cleaner_id: string;
    section_key: string;
    section_label: string;
    photo_type: string;
    signed_url: string | null;
    created_at: string;
  }>;
};

export type CleanerJobWire = {
  id: string;
  service?: string | null;
  service_slug?: string | null;
  service_name?: string | null;
  service_type?: string | null;
  rooms?: number | null;
  bathrooms?: number | null;
  date: string | null;
  time: string | null;
  location: string | null;
  location_display?: string | null;
  status: string | null;
  dispatch_status?: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  extras?: unknown[] | null;
  lineItems?: CleanerBookingLineItemWire[] | null;
  scope_lines?: string[] | null;
  service_detail_lines?: string[] | null;
  access_detail_lines?: string[] | null;
  assigned_at?: string | null;
  accepted_at?: string | null;
  en_route_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  duration_hours?: number | null;
  duration_minutes?: number | null;
  job_notes?: string | null;
  cleaner_response_status?: string | null;
  is_team_job?: boolean | null;
  is_lead_cleaner?: boolean | null;
  displayEarningsCents?: number | null;
  display_earnings_cents?: number | null;
  earnings_cents?: number | null;
  displayEarningsIsEstimate?: boolean;
  earnings_is_estimate?: boolean;
  service_qa?: ServiceQaCleanerWire | null;
  cleaner_pending_payment_banner?: string | null;
  server_now_ms?: number;
};

export type CleanerLifecycleAction = "accept" | "reject" | "en_route" | "start" | "complete";

export type CleanerMeResponse = {
  cleaner: {
    id: string;
    full_name: string | null;
    phone?: string | null;
    phone_number?: string | null;
    email?: string | null;
    status?: string | null;
    is_available?: boolean | null;
    rating?: number | null;
    jobs_completed?: number | null;
  } | null;
  user: { id: string; email: string | null } | null;
  isCleaner: boolean;
  teamIds?: string[];
  completion_pct?: number;
};

export type CleanerLoginResponse = {
  ok: true;
  cleanerId: string;
  session: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    expires_at?: number;
    token_type: string;
  };
  cleaner: {
    id: string;
    full_name: string | null;
    phone_number: string | null;
    status: string | null;
  };
};

export type CleanerJobsListResponse = { jobs: CleanerJobWire[] };
export type CleanerJobDetailResponse = { job: CleanerJobWire };
export type CleanerDashboardResponse = {
  jobs: CleanerJobWire[];
  summary?: {
    today_cents?: number;
    today_breakdown?: unknown;
    suggested_daily_goal_cents?: number;
    server_now_ms?: number;
    earnings_timezone?: string;
  };
};

export type CleanerEarningsRowWire = {
  booking_id: string;
  date: string | null;
  service: string;
  location: string;
  payout_status: "pending" | "eligible" | "paid" | "invalid" | string;
  payout_frozen_cents: number | null;
  amount_cents: number;
  payout_paid_at: string | null;
  payout_run_id: string | null;
  in_frozen_batch?: boolean;
};

export type CleanerEarningsResponse = {
  as_of?: string;
  summary?: {
    pending_cents?: number;
    eligible_cents?: number;
    paid_cents?: number;
    invalid_cents?: number;
    frozen_batch_cents?: number;
    today_cents?: number;
    week_cents?: number;
    month_cents?: number;
    suggested_daily_goal_cents?: number;
    bonus_total_cents?: number;
  };
  total_pending?: number;
  total_approved?: number;
  total_paid?: number;
  total_all_time?: number;
  paymentDetails?: {
    readyForPayout?: boolean;
    missingBankDetails?: boolean;
  };
  rows?: CleanerEarningsRowWire[];
};

export type CleanerRosterAvailabilityWire = {
  date: string;
  start_time?: string | null;
  end_time?: string | null;
  is_available?: boolean | null;
};

export type CleanerRosterResponse = {
  availability: CleanerRosterAvailabilityWire[];
  workingAreas: { id: string; name: string }[];
};

export type CleanerNotificationKind =
  | "booking_assigned"
  | "booking_updated"
  | "reminder"
  | "payment"
  | "announcement";

export type CleanerNotificationItem = {
  id: string;
  kind: CleanerNotificationKind;
  title: string;
  body: string;
  createdAt: string;
  href?: string;
  bookingId?: string;
};

export type CleanerReferralMeResponse = {
  referralCode: string;
  totalEarned: number;
  referralsCount: number;
  bonusPayout: number;
};

export type CleanerProfileSummaryResponse = {
  name: string;
  phone: string;
  email: string;
  status: string | null;
  is_available: boolean;
  has_payment_method: boolean;
  has_failed_transfer: boolean;
  total_all_time_cents: number;
  payout_schedule_headline: string;
  payout_schedule_sub: string;
  account_number_masked: string | null;
  bank_code: string | null;
  account_name: string | null;
};

export type CleanerFeedbackSubmission = {
  id: string;
  submission_type: "report" | "feedback" | string;
  subject: string | null;
  message: string;
  status: string;
  admin_response: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type CleanerFeedbackListResponse = {
  submissions: CleanerFeedbackSubmission[];
};

export type PhotoUploadResponse = {
  ok: true;
  id: string;
  created_at: string;
  signed_url: string | null;
};
