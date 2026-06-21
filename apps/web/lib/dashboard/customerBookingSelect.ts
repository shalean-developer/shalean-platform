import type { BookingCustomerOwnershipColumn } from "@/lib/booking/bookingCustomerIdentity";

const CUSTOMER_BOOKING_SELECT_FIELDS = [
  "id",
  "__OWNERSHIP__",
  "customer_email",
  "service",
  "service_slug",
  "date",
  "time",
  "location",
  "suburb",
  "postal_code",
  "access_instructions",
  "parking_instructions",
  "gate_code",
  "service_details",
  "selected_extras",
  "pricing_summary",
  "cleaner_mode",
  "cleaner_count",
  "booking_type",
  "total_paid_zar",
  "total_price",
  "price_breakdown",
  "pricing_version_id",
  "amount_paid_cents",
  "currency",
  "status",
  "dispatch_status",
  "assignment_type",
  "fallback_reason",
  "payment_needs_follow_up",
  "selected_cleaner_id",
  "preferred_dispatch_status",
  "payment_status",
  "booking_snapshot",
  "created_at",
  "booking_reference",
  "paystack_reference",
  "cleaner_id",
  /*
   * H-8 — exposes the team-lead cleaner UUID to the customer dashboard so
   * the "Reviewable bookings" filter can fall back to it when team jobs
   * have `cleaner_id=null`. Read-only on the client; payout ownership
   * itself is owned by the dispatch / completion paths.
   */
  "payout_owner_cleaner_id",
  "cleaner_response_status",
  "assigned_at",
  "accepted_at",
  "en_route_at",
  "started_at",
  "completed_at",
  "payment_completed_at",
  "is_recurring_generated",
  "billing_type",
  "is_team_job",
  "team_id",
  "payout_status",
  "payout_paid_at",
  "admin_recurring_unpaid_completion_override_at",
  "admin_recurring_unpaid_completion_override_by",
  "duration_minutes",
  "rooms",
  "bathrooms",
  "extras",
  "monthly_invoice_id",
  "is_monthly_billing_booking",
  "monthly_invoices(status,is_closed)",
  /** Zoho Books invoice id (set on payment); gates the in-app invoice PDF button. */
  "zoho_invoice_id",
  /* cleaners join intentionally omitted — multiple FKs cause PostgREST ambiguity;
     cleaner name is resolved via booking_snapshot.cleaner_name in cleanerFromRow(). */
] as const;

/** Supabase `select` fragment for customer dashboard booking lists (keep in sync with {@link BookingRow}). */
export function buildCustomerBookingSelect(ownershipColumn: BookingCustomerOwnershipColumn): string {
  return CUSTOMER_BOOKING_SELECT_FIELDS.map((field) =>
    field === "__OWNERSHIP__" ? ownershipColumn : field,
  ).join(",");
}

/** Default select for local/dev schemas that still expose `user_id`. */
export const CUSTOMER_BOOKING_SELECT = buildCustomerBookingSelect("user_id");
