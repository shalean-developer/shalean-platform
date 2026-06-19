import type { DashboardLifecycleAlignmentWire } from "@/lib/booking/bookingLifecycleContract";

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
  /** From list/detail API when present — canonical earnings summary JSON. */
  earnings_summary?: unknown;
  /** From GET /api/admin/bookings — shared lifecycle bundle (customer/cleaner parity). */
  dashboardLifecycle?: DashboardLifecycleAlignmentWire | null;
};

/**
 * Narrow union accepted by `AdminBookingsListRow.dispatch_status`.
 *
 * Kept aligned with the type literal above. The broader
 * `BOOKING_DISPATCH_STATUSES` in `assignmentLifecycleContract.ts` covers
 * additional historical states (`unassigned`, `accepted`, `expired`) that
 * are NOT part of this admin-list contract — do not widen this set without
 * also widening `AdminBookingsListRow.dispatch_status`.
 */
export const ADMIN_BOOKING_DISPATCH_STATUS_VALUES = [
  "searching",
  "offered",
  "assigned",
  "failed",
  "no_cleaner",
  "unassignable",
] as const;

export type AdminBookingDispatchStatus =
  (typeof ADMIN_BOOKING_DISPATCH_STATUS_VALUES)[number];

/**
 * Coerce a raw `bookings.dispatch_status` value (typed as `string | null` on
 * the detail GET response) into the narrow `AdminBookingsListRow.dispatch_status`
 * union. Anything outside the allowed set — including unknown legacy states —
 * is normalized to `null` so callers stay type-safe without an unsafe cast.
 */
export function normalizeAdminBookingDispatchStatus(
  raw: string | null | undefined,
): AdminBookingDispatchStatus | null {
  if (raw == null) return null;
  return (ADMIN_BOOKING_DISPATCH_STATUS_VALUES as readonly string[]).includes(raw)
    ? (raw as AdminBookingDispatchStatus)
    : null;
}
