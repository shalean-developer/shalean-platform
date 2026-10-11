export type AdminBookingDeleteBlockCode =
  | "admin_booking_delete_marked_paid_by_admin"
  | "admin_booking_delete_zoho_invoice_linked"
  | "admin_booking_delete_refund_marker_present"
  | "admin_booking_delete_payout_paid_at_present"
  | "admin_booking_delete_payout_run_linked"
  | "admin_booking_delete_payment_completed"
  | "admin_booking_delete_paid_payment_status"
  | "admin_booking_delete_completed_status"
  | "admin_booking_delete_monthly_financial_flow"
  | "admin_booking_delete_monthly_invoice_child"
  | "admin_booking_delete_sales_document_child"
  | "admin_booking_delete_payout_linked"
  | "admin_booking_delete_payout_status_locked"
  | "admin_booking_delete_payout_frozen"
  | "admin_booking_delete_display_earnings_present"
  | "admin_booking_delete_cleaner_payout_present"
  | "admin_booking_delete_cleaner_bonus_present"
  | "admin_booking_delete_payout_earnings_present"
  | "admin_booking_delete_paid_at_present"
  | "admin_booking_delete_amount_paid_present"
  | "admin_booking_delete_deposit_paid_present"
  | "admin_booking_delete_total_paid_present"
  | "admin_booking_delete_payment_transaction_linked"
  | "admin_booking_delete_expense_linked"
  | "admin_booking_delete_inventory_cost_linked"
  | "admin_booking_delete_transport_cost_linked"
  | "admin_booking_delete_earnings_snapshot_linked"
  | "admin_booking_delete_cleaner_earnings_linked"
  | "admin_booking_delete_cleaner_earnings_adjustment_linked"
  | "admin_booking_delete_cleaner_earnings_dispute_linked"
  | "admin_booking_delete_team_member_payout_linked"
  | "admin_booking_delete_roster_member_payout_linked"
  | "admin_booking_delete_payout_audit_linked"
  | "admin_booking_delete_cleaning_credit_transaction_linked"
  | "admin_booking_delete_invoice_adjustment_linked"
  | "admin_booking_delete_refund_record_linked"
  | "admin_booking_delete_referral_redemption_linked"
  | "admin_booking_delete_referral_event_linked"
  | "admin_booking_delete_accounting_invoice_sync_linked"
  | "admin_booking_delete_accounting_sync_linked"
  | "admin_booking_delete_money_proposal_linked"
  | "admin_booking_delete_earnings_action_linked"
  | "admin_booking_delete_promotion_redemption_linked";

export type AdminBookingDeleteSafetyRow = {
  status?: string | null;
  payment_status?: string | null;
  marked_paid_by_admin_id?: string | null;
  zoho_invoice_id?: string | null;
  refunded_at?: string | null;
  refund_status?: string | null;
  payout_paid_at?: string | null;
  payout_run_id?: string | null;
  payment_completed_at?: string | null;
  paid_at?: string | null;
  is_monthly_billing_booking?: boolean | null;
  monthly_invoice_id?: string | null;
  sales_document_id?: string | null;
  payout_id?: string | null;
  payout_status?: string | null;
  payout_frozen_cents?: number | string | null;
  display_earnings_cents?: number | string | null;
  cleaner_payout_cents?: number | string | null;
  cleaner_bonus_cents?: number | string | null;
  payout_earnings_cents?: number | string | null;
  amount_paid_cents?: number | string | null;
  deposit_paid_cents?: number | string | null;
  total_paid_cents?: number | string | null;
  total_paid_zar?: number | string | null;
  payment_transaction_id?: string | null;
  linked_expense_id?: string | null;
  linked_inventory_cost_id?: string | null;
  linked_transport_cost_id?: string | null;
  linked_earnings_snapshot_booking_id?: string | null;
  linked_cleaner_earning_id?: string | null;
  linked_cleaner_earnings_adjustment_id?: string | null;
  linked_cleaner_earnings_dispute_id?: string | null;
  linked_team_member_payout_id?: string | null;
  linked_roster_member_payout_id?: string | null;
  linked_payout_audit_event_id?: string | null;
  linked_cleaning_credit_transaction_id?: string | null;
  linked_invoice_adjustment_id?: string | null;
  linked_refund_record_id?: string | null;
  linked_referral_redemption_id?: string | null;
  linked_referral_event_id?: string | null;
  linked_accounting_invoice_sync_id?: string | null;
  linked_accounting_sync_id?: string | null;
  linked_money_proposal_id?: string | null;
  linked_earnings_action_id?: string | null;
  linked_promotion_redemption_id?: string | null;
};

export type AdminBookingDeleteBlock = {
  code: AdminBookingDeleteBlockCode;
  message: string;
};

export type AdminBookingDeleteSafetyResult =
  | { ok: true }
  | {
      ok: false;
      code: AdminBookingDeleteBlockCode;
      error: string;
      blocks: AdminBookingDeleteBlock[];
    };

const PAID_LIKE_PAYMENT_STATUSES = new Set(["paid", "success", "succeeded"]);
const PAYOUT_LOCKED_STATUSES = new Set(["eligible", "approved", "processing", "paid"]);

function hasText(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : value != null;
}

function positiveCents(value: unknown): boolean {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

function norm(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function assertAdminBookingDeleteSafe(row: AdminBookingDeleteSafetyRow): AdminBookingDeleteSafetyResult {
  const blocks: AdminBookingDeleteBlock[] = [];

  if (hasText(row.marked_paid_by_admin_id)) {
    blocks.push({
      code: "admin_booking_delete_marked_paid_by_admin",
      message: "Bookings marked paid by an admin cannot be hard-deleted.",
    });
  }

  if (hasText(row.zoho_invoice_id)) {
    blocks.push({
      code: "admin_booking_delete_zoho_invoice_linked",
      message: "Bookings linked to a Zoho invoice cannot be hard-deleted.",
    });
  }

  if (hasText(row.refunded_at) || hasText(row.refund_status)) {
    blocks.push({
      code: "admin_booking_delete_refund_marker_present",
      message: "Bookings with refund or chargeback markers cannot be hard-deleted.",
    });
  }

  if (hasText(row.payout_paid_at)) {
    blocks.push({
      code: "admin_booking_delete_payout_paid_at_present",
      message: "Bookings with payout_paid_at cannot be hard-deleted.",
    });
  }

  if (hasText(row.payout_run_id)) {
    blocks.push({
      code: "admin_booking_delete_payout_run_linked",
      message: "Bookings linked to a payout run cannot be hard-deleted.",
    });
  }

  if (hasText(row.payment_completed_at)) {
    blocks.push({
      code: "admin_booking_delete_payment_completed",
      message: "Booking has payment_completed_at and cannot be hard-deleted.",
    });
  }

  if (PAID_LIKE_PAYMENT_STATUSES.has(norm(row.payment_status))) {
    blocks.push({
      code: "admin_booking_delete_paid_payment_status",
      message: "Booking has a paid/success payment_status and cannot be hard-deleted.",
    });
  }

  if (norm(row.payment_status) === "pending_monthly" || row.is_monthly_billing_booking === true) {
    blocks.push({
      code: "admin_booking_delete_monthly_financial_flow",
      message: "Monthly-billing bookings awaiting invoice settlement cannot be hard-deleted.",
    });
  }

  if (norm(row.status) === "completed") {
    blocks.push({
      code: "admin_booking_delete_completed_status",
      message: "Completed bookings cannot be hard-deleted.",
    });
  }

  if (hasText(row.monthly_invoice_id)) {
    blocks.push({
      code: "admin_booking_delete_monthly_invoice_child",
      message: "Monthly invoice-backed bookings cannot be hard-deleted.",
    });
  }

  if (hasText(row.sales_document_id)) {
    blocks.push({
      code: "admin_booking_delete_sales_document_child",
      message: "Sales-document invoice-backed bookings cannot be hard-deleted. Cancel or expire the booking so the invoice linkage remains auditable.",
    });
  }

  if (hasText(row.payout_id)) {
    blocks.push({
      code: "admin_booking_delete_payout_linked",
      message: "Payout-linked bookings cannot be hard-deleted.",
    });
  }

  if (PAYOUT_LOCKED_STATUSES.has(norm(row.payout_status))) {
    blocks.push({
      code: "admin_booking_delete_payout_status_locked",
      message: "Bookings with payout_status eligible/approved/processing/paid cannot be hard-deleted.",
    });
  }

  if (positiveCents(row.payout_frozen_cents)) {
    blocks.push({
      code: "admin_booking_delete_payout_frozen",
      message: "Bookings with positive payout_frozen_cents cannot be hard-deleted.",
    });
  }

  if (positiveCents(row.display_earnings_cents)) {
    blocks.push({
      code: "admin_booking_delete_display_earnings_present",
      message: "Bookings with positive display_earnings_cents cannot be hard-deleted.",
    });
  }

  if (positiveCents(row.cleaner_payout_cents)) {
    blocks.push({
      code: "admin_booking_delete_cleaner_payout_present",
      message: "Bookings with positive cleaner_payout_cents cannot be hard-deleted.",
    });
  }

  if (positiveCents(row.cleaner_bonus_cents)) {
    blocks.push({
      code: "admin_booking_delete_cleaner_bonus_present",
      message: "Bookings with positive cleaner_bonus_cents cannot be hard-deleted.",
    });
  }

  if (positiveCents(row.payout_earnings_cents)) {
    blocks.push({
      code: "admin_booking_delete_payout_earnings_present",
      message: "Bookings with positive payout_earnings_cents cannot be hard-deleted.",
    });
  }

  if (hasText(row.paid_at)) {
    blocks.push({
      code: "admin_booking_delete_paid_at_present",
      message: "Bookings with paid_at cannot be hard-deleted.",
    });
  }

  if (positiveCents(row.amount_paid_cents)) {
    blocks.push({
      code: "admin_booking_delete_amount_paid_present",
      message: "Bookings with positive amount_paid_cents cannot be hard-deleted.",
    });
  }

  if (positiveCents(row.deposit_paid_cents)) {
    blocks.push({
      code: "admin_booking_delete_deposit_paid_present",
      message: "Bookings with a recorded deposit cannot be hard-deleted.",
    });
  }

  if (positiveCents(row.total_paid_cents)) {
    blocks.push({
      code: "admin_booking_delete_total_paid_present",
      message: "Bookings with positive total_paid_cents cannot be hard-deleted.",
    });
  }

  if (hasText(row.payment_transaction_id)) {
    blocks.push({
      code: "admin_booking_delete_payment_transaction_linked",
      message: "Bookings linked to a payment transaction cannot be hard-deleted.",
    });
  }

  if (hasText(row.linked_expense_id)) {
    blocks.push({
      code: "admin_booking_delete_expense_linked",
      message: "Bookings linked to an expense cannot be hard-deleted.",
    });
  }

  if (hasText(row.linked_inventory_cost_id)) {
    blocks.push({
      code: "admin_booking_delete_inventory_cost_linked",
      message: "Bookings linked to inventory cost movements cannot be hard-deleted.",
    });
  }

  if (hasText(row.linked_transport_cost_id)) {
    blocks.push({
      code: "admin_booking_delete_transport_cost_linked",
      message: "Bookings linked to transport cost entries cannot be hard-deleted.",
    });
  }

  if (hasText(row.linked_earnings_snapshot_booking_id)) {
    blocks.push({
      code: "admin_booking_delete_earnings_snapshot_linked",
      message: "Bookings linked to cleaner earnings snapshots cannot be hard-deleted.",
    });
  }

  if (hasText(row.linked_cleaner_earning_id)) {
    blocks.push({
      code: "admin_booking_delete_cleaner_earnings_linked",
      message: "Bookings linked to cleaner earnings ledger rows cannot be hard-deleted.",
    });
  }

  if (hasText(row.linked_cleaner_earnings_adjustment_id)) {
    blocks.push({
      code: "admin_booking_delete_cleaner_earnings_adjustment_linked",
      message: "Bookings linked to cleaner earnings adjustments cannot be hard-deleted.",
    });
  }

  if (hasText(row.linked_cleaner_earnings_dispute_id)) {
    blocks.push({
      code: "admin_booking_delete_cleaner_earnings_dispute_linked",
      message: "Bookings linked to cleaner earnings disputes cannot be hard-deleted.",
    });
  }

  if (hasText(row.linked_team_member_payout_id)) {
    blocks.push({
      code: "admin_booking_delete_team_member_payout_linked",
      message: "Bookings linked to team member payout allocations cannot be hard-deleted.",
    });
  }

  if (hasText(row.linked_roster_member_payout_id)) {
    blocks.push({
      code: "admin_booking_delete_roster_member_payout_linked",
      message: "Bookings linked to roster member payout allocations cannot be hard-deleted.",
    });
  }

  if (hasText(row.linked_payout_audit_event_id)) {
    blocks.push({
      code: "admin_booking_delete_payout_audit_linked",
      message: "Bookings referenced by payout audit events cannot be hard-deleted.",
    });
  }

  if (hasText(row.linked_cleaning_credit_transaction_id)) {
    blocks.push({
      code: "admin_booking_delete_cleaning_credit_transaction_linked",
      message: "Bookings linked to Cleaning Credit transactions cannot be hard-deleted.",
    });
  }

  if (hasText(row.linked_invoice_adjustment_id)) {
    blocks.push({
      code: "admin_booking_delete_invoice_adjustment_linked",
      message: "Bookings linked to invoice adjustments cannot be hard-deleted.",
    });
  }

  if (hasText(row.linked_refund_record_id)) {
    blocks.push({
      code: "admin_booking_delete_refund_record_linked",
      message: "Bookings linked to refund accounting records cannot be hard-deleted.",
    });
  }

  if (hasText(row.linked_referral_redemption_id)) {
    blocks.push({
      code: "admin_booking_delete_referral_redemption_linked",
      message: "Bookings linked to referral discount redemptions cannot be hard-deleted.",
    });
  }

  if (hasText(row.linked_referral_event_id)) {
    blocks.push({
      code: "admin_booking_delete_referral_event_linked",
      message: "Bookings linked to referral events cannot be hard-deleted.",
    });
  }

  if (hasText(row.linked_accounting_invoice_sync_id)) {
    blocks.push({
      code: "admin_booking_delete_accounting_invoice_sync_linked",
      message: "Bookings linked to accounting invoice sync history cannot be hard-deleted.",
    });
  }

  if (hasText(row.linked_accounting_sync_id)) {
    blocks.push({
      code: "admin_booking_delete_accounting_sync_linked",
      message: "Bookings linked to accounting sync history cannot be hard-deleted.",
    });
  }

  if (hasText(row.linked_money_proposal_id)) {
    blocks.push({
      code: "admin_booking_delete_money_proposal_linked",
      message: "Bookings linked to money-action proposals cannot be hard-deleted.",
    });
  }

  if (hasText(row.linked_earnings_action_id)) {
    blocks.push({
      code: "admin_booking_delete_earnings_action_linked",
      message: "Bookings linked to admin earnings actions cannot be hard-deleted.",
    });
  }

  if (hasText(row.linked_promotion_redemption_id)) {
    blocks.push({
      code: "admin_booking_delete_promotion_redemption_linked",
      message: "Bookings linked to promotion redemptions cannot be hard-deleted.",
    });
  }

  if (blocks.length === 0) return { ok: true };

  return {
    ok: false,
    code: blocks[0]!.code,
    error: blocks[0]!.message,
    blocks,
  };
}
