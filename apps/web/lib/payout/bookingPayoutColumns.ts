/** Use when `cleaner_id` is cleared or reassigned so a new assignment can persist payout once. */
export const BOOKING_PAYOUT_COLUMNS_CLEAR = {
  cleaner_payout_cents: null,
  cleaner_bonus_cents: null,
  company_revenue_cents: null,
  payout_percentage: null,
  payout_type: null,
} as const;
