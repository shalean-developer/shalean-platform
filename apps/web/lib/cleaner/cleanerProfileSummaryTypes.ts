/** Wire shape for `GET /api/cleaner/profile-summary` (cleaner mobile profile hub). */
export type CleanerProfileSummaryJson = {
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
  account_number_masked?: string | null;
  bank_code?: string | null;
  account_name?: string | null;
};
