import type { AdminBookingsListRow } from "@/lib/admin/adminBookingsListRow";

/**
 * Maps an admin list row into a `bookings`-shaped record for {@link describeBookingOperationalState}.
 * Fills recurring / assignment signals so list badges match detail + cleaner semantics.
 */
export function adminBookingsListRowToOperationalRecord(row: AdminBookingsListRow): Record<string, unknown> {
  const billingFromCustomer =
    row.customer_billing_type === "monthly" ? "monthly_contract" : null;
  return {
    id: row.id,
    status: row.status,
    dispatch_status: row.dispatch_status,
    completed_at: row.completed_at,
    started_at: row.started_at,
    en_route_at: row.en_route_at,
    cleaner_response_status: row.cleaner_response_status ?? null,
    accepted_at: row.accepted_at ?? null,
    assigned_at: row.assigned_at,
    created_at: row.created_at,
    cleaner_id: row.cleaner_id,
    team_id: row.team_id,
    is_team_job: row.is_team_job,
    payment_completed_at: row.payment_completed_at ?? null,
    payout_status: row.payout_status ?? null,
    payout_paid_at: row.payout_paid_at ?? null,
    monthly_invoice_id: row.monthly_invoice_id,
    billing_type: row.billing_type ?? billingFromCustomer,
    is_recurring_generated: row.is_recurring_generated ?? null,
    admin_recurring_unpaid_completion_override_at: row.admin_recurring_unpaid_completion_override_at ?? null,
    admin_recurring_unpaid_completion_override_by: row.admin_recurring_unpaid_completion_override_by ?? null,
  };
}
