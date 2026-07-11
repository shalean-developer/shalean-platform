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
    server_now_ms?: number;
  };
};

export type PhotoUploadResponse = {
  ok: true;
  id: string;
  created_at: string;
  signed_url: string | null;
};
