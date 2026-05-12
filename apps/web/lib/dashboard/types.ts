import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import type { CanonicalBookingLifecycleSurface } from "@/lib/booking/bookingLifecycleContract";
import type { StoredPriceLine } from "@/lib/dashboard/storedPriceBreakdown";

export type NormalizedBookingStatus =
  | "pending"
  | "pending_assignment"
  | "offered"
  | "assigned"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "failed"
  | "pending_payment"
  | "payment_mismatch"
  | "payment_reconciliation_required";

/** Embedded cleaner row from Supabase join. */
export type CleanerEmbed = { full_name: string | null; phone: string | null } | null;

export type BookingRow = {
  id: string;
  /** Set on customer bookings API payloads; used for list/detail ownership checks. */
  user_id?: string | null;
  customer_email?: string | null;
  service: string | null;
  date: string | null;
  time: string | null;
  rooms?: number | null;
  bathrooms?: number | null;
  /** Persisted add-on line items `{ slug, name, price }[]` from checkout. */
  extras?: unknown;
  location: string | null;
  total_paid_zar: number | null;
  amount_paid_cents: number | null;
  currency: string | null;
  status: string | null;
  dispatch_status?: string | null;
  assignment_type?: string | null;
  fallback_reason?: string | null;
  payment_needs_follow_up?: boolean | null;
  selected_cleaner_id?: string | null;
  cleaner_response_status?: string | null;
  /** Monthly billing sub-state when set (e.g. `pending_monthly`). */
  payment_status?: string | null;
  monthly_invoice_id?: string | null;
  is_monthly_billing_booking?: boolean | null;
  /** Nested from `monthly_invoices(status,is_closed)` when selected. */
  monthly_invoices?: { status: string; is_closed?: boolean } | null;
  booking_snapshot: BookingSnapshotV1 | null | unknown;
  created_at: string;
  paystack_reference: string;
  cleaner_id?: string | null;
  /** Team-lead cleaner UUID; carries the assignee for team jobs where `cleaner_id` is cleared. */
  payout_owner_cleaner_id?: string | null;
  assigned_at?: string | null;
  accepted_at?: string | null;
  en_route_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  /** Canonical lifecycle surface; set by customer bookings list/detail loaders only. */
  canonicalLifecycle?: CanonicalBookingLifecycleSurface;
  payment_completed_at?: string | null;
  is_recurring_generated?: boolean | null;
  billing_type?: string | null;
  is_team_job?: boolean | null;
  team_id?: string | null;
  payout_status?: string | null;
  payout_paid_at?: string | null;
  admin_recurring_unpaid_completion_override_at?: string | null;
  admin_recurring_unpaid_completion_override_by?: string | null;
  duration_minutes?: number | null;
  cleaners?: CleanerEmbed;
  /** Locked checkout total (ZAR); authoritative when set. */
  total_price?: number | string | null;
  /** Persisted {@link import("@/lib/pricing/pricingEngine").CheckoutQuoteResult} JSON from checkout. */
  price_breakdown?: Record<string, unknown> | null;
  pricing_version_id?: string | null;
};

export type CustomerAddressRow = {
  id: string;
  user_id: string;
  label: string;
  line1: string;
  suburb: string;
  city: string;
  postal_code: string;
  /** Optional property-level instructions (saved address). */
  notes?: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type CustomerAddressInput = Pick<CustomerAddressRow, "label" | "line1" | "suburb" | "city" | "postal_code" | "is_default">;

export type UserNotificationRow = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: string;
  read_at: string | null;
  created_at: string;
  booking_id?: string | null;
};

export type ReviewRow = {
  id: string;
  booking_id: string;
  user_id: string | null;
  cleaner_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  bookings?: { service: string | null; date: string | null } | null;
};

/** Normalized shape for dashboard UI components. */
export type DashboardBooking = {
  id: string;
  serviceName: string;
  date: string;
  time: string;
  addressLine: string;
  suburb: string;
  priceZar: number;
  status: NormalizedBookingStatus;
  durationHours: number;
  rooms: string[];
  extras: string[];
  priceLines: StoredPriceLine[];
  cleaner: { name: string; initials: string; phone?: string } | null;
  paystackReference: string;
  createdAt: string;
  scheduledAt: string;
  /** Raw row for detail / mutations */
  raw: BookingRow;
  /**
   * When true, `priceZar` and `priceLines` come only from `total_price` + `price_breakdown` (no pricing engine).
   */
  priceDisplayFromCheckout: boolean;
  /**
   * When checkout breakdown is shown, ties UI and logs to this booking (same as `id`; explicit for support / disputes).
   */
  checkoutPriceContext: { bookingId: string } | null;
  /** Engine/catalog marker from stored breakdown (`pricingVersion`). */
  pricingAlgorithmVersion?: number | null;
};
