export type AdminBookingDeleteBlockCode =
  | "admin_booking_delete_payment_completed"
  | "admin_booking_delete_paid_payment_status"
  | "admin_booking_delete_completed_status"
  | "admin_booking_delete_monthly_invoice_child"
  | "admin_booking_delete_sales_document_child"
  | "admin_booking_delete_payout_linked"
  | "admin_booking_delete_payout_status_locked"
  | "admin_booking_delete_payout_frozen"
  | "admin_booking_delete_display_earnings_present"
  | "admin_booking_delete_paid_at_present"
  | "admin_booking_delete_amount_paid_present"
  | "admin_booking_delete_total_paid_present"
  | "admin_booking_delete_payment_transaction_linked"
  | "admin_booking_delete_expense_linked"
  | "admin_booking_delete_cleaner_earnings_linked"
  | "admin_booking_delete_cleaner_earnings_adjustment_linked"
  | "admin_booking_delete_team_member_payout_linked"
  | "admin_booking_delete_roster_member_payout_linked"
  | "admin_booking_delete_cleaning_credit_transaction_linked";

export type AdminBookingDeleteSafetyRow = {
  status?: string | null;
  payment_status?: string | null;
  payment_completed_at?: string | null;
  paid_at?: string | null;
  monthly_invoice_id?: string | null;
  sales_document_id?: string | null;
  payout_id?: string | null;
  payout_status?: string | null;
  payout_frozen_cents?: number | string | null;
  display_earnings_cents?: number | string | null;
  amount_paid_cents?: number | string | null;
  total_paid_cents?: number | string | null;
  total_paid_zar?: number | string | null;
  payment_transaction_id?: string | null;
  linked_expense_id?: string | null;
  linked_cleaner_earning_id?: string | null;
  linked_cleaner_earnings_adjustment_id?: string | null;
  linked_team_member_payout_id?: string | null;
  linked_roster_member_payout_id?: string | null;
  linked_cleaning_credit_transaction_id?: string | null;
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

  if (hasText(row.linked_cleaner_earning_id)) {
    blocks.push({
      code: "admin_booking_delete_cleaner_earnings_linked",
      message: "Bookings linked to approved/processing/paid cleaner earnings cannot be hard-deleted.",
    });
  }

  if (hasText(row.linked_cleaner_earnings_adjustment_id)) {
    blocks.push({
      code: "admin_booking_delete_cleaner_earnings_adjustment_linked",
      message: "Bookings linked to cleaner earnings adjustments cannot be hard-deleted.",
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

  if (hasText(row.linked_cleaning_credit_transaction_id)) {
    blocks.push({
      code: "admin_booking_delete_cleaning_credit_transaction_linked",
      message: "Bookings linked to Cleaning Credit transactions cannot be hard-deleted.",
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
