import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTotalPaidCents } from "@/lib/payout/calculateCleanerPayout";
import {
  bookingPaymentRecomputeBlockedByRefund,
  bookingSignalsPaidForZeroDisplayRecompute,
  type BookingPaidSignalRow,
  bookingsPersistFullFinancialSelectSuffix,
} from "@/lib/payout/bookingEarningsIntegrity";

/** Columns loaded before admin PATCH so we can preflight earnings and revert a failed paid-solo assignment. */
export function adminBookingBeforeAssignmentPatchSelectList(): string {
  return (
    "user_id, cleaner_id, status, completed_at, payout_owner_cleaner_id, is_team_job, team_id, date, time, selected_cleaner_id, billing_type, monthly_invoice_id, is_recurring_generated, dispatch_status, cleaner_response_status, assigned_at, en_route_at, started_at, display_earnings_cents, payout_earnings_cents, internal_earnings_cents, earnings_model_version, earnings_percentage_applied, earnings_cap_cents_applied, earnings_tenure_months_at_assignment, cleaner_earnings_total_cents, cleaner_line_earnings_finalized_at, cleaner_payout_cents, cleaner_bonus_cents, company_revenue_cents, payout_percentage, payout_type, total_paid_zar, total_paid_cents, amount_paid_cents, base_amount_cents, service_fee_cents, payment_status, booking_snapshot, service, payout_id" +
    bookingsPersistFullFinancialSelectSuffix()
  );
}

export type AdminBookingAssignmentBeforeRow = Record<string, unknown>;

export function bookingPaidCustomerSignalsPresent(row: BookingPaidSignalRow): boolean {
  if (resolveTotalPaidCents(row.total_paid_zar, row.total_paid_cents ?? row.amount_paid_cents) > 0) return true;
  return bookingSignalsPaidForZeroDisplayRecompute(row);
}

/**
 * Paid solo (non-team, non-invoice) jobs must not be exposed to cleaners without a persisted
 * display earnings basis — customer cash is settled and completion integrity requires it.
 */
export function bookingRequiresPersistedEarningsBeforeCleanerNotify(row: {
  is_team_job?: boolean | null;
  billing_type?: string | null;
  is_monthly_billing_booking?: boolean | null;
  monthly_invoice_id?: string | null;
  status?: string | null;
} & BookingPaidSignalRow): boolean {
  if (row.is_team_job === true) return false;
  const st = String(row.status ?? "").toLowerCase();
  if (st === "cancelled" || st === "failed") return false;
  if (bookingPaymentRecomputeBlockedByRefund(row)) return false;
  if (row.is_monthly_billing_booking === true) return false;
  const mid = row.monthly_invoice_id;
  if (mid != null && String(mid).trim() !== "") return false;
  const bt = String(row.billing_type ?? "").toLowerCase();
  if (bt === "monthly_contract" || bt === "recurring_invoice") return false;
  if (bt === "pay_later") return false;
  if (!bookingPaidCustomerSignalsPresent(row)) return false;
  return true;
}

export async function revertAdminBookingAssignmentToBeforeRow(
  admin: SupabaseClient,
  bookingId: string,
  before: AdminBookingAssignmentBeforeRow,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const patch: Record<string, unknown> = {
    cleaner_id: (before.cleaner_id as string | null | undefined) ?? null,
    status: before.status ?? "pending",
    dispatch_status: before.dispatch_status ?? null,
    cleaner_response_status: before.cleaner_response_status ?? null,
    assigned_at: before.assigned_at ?? null,
    en_route_at: before.en_route_at ?? null,
    started_at: before.started_at ?? null,
    display_earnings_cents: before.display_earnings_cents ?? null,
    payout_earnings_cents: before.payout_earnings_cents ?? null,
    internal_earnings_cents: before.internal_earnings_cents ?? null,
    earnings_model_version: before.earnings_model_version ?? null,
    earnings_percentage_applied: before.earnings_percentage_applied ?? null,
    earnings_cap_cents_applied: before.earnings_cap_cents_applied ?? null,
    earnings_tenure_months_at_assignment: before.earnings_tenure_months_at_assignment ?? null,
    cleaner_earnings_total_cents: before.cleaner_earnings_total_cents ?? null,
    cleaner_line_earnings_finalized_at: before.cleaner_line_earnings_finalized_at ?? null,
    cleaner_payout_cents: before.cleaner_payout_cents ?? null,
    cleaner_bonus_cents: before.cleaner_bonus_cents ?? null,
    company_revenue_cents: before.company_revenue_cents ?? null,
    payout_percentage: before.payout_percentage ?? null,
    payout_type: before.payout_type ?? null,
  };
  const { error } = await admin.from("bookings").update(patch).eq("id", bookingId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
