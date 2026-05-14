export const ADMIN_MARK_PAID_MONTHLY_CHILD_BLOCK_CODE = "admin_mark_paid_monthly_invoice_child_blocked";

export type AdminMarkPaidMonthlyChildRow = {
  monthly_invoice_id?: string | null;
  payment_status?: string | null;
  is_monthly_billing_booking?: boolean | null;
  billing_type?: string | null;
};

export type AdminMarkPaidMonthlyChildGuardResult =
  | { ok: true }
  | {
      ok: false;
      code: typeof ADMIN_MARK_PAID_MONTHLY_CHILD_BLOCK_CODE;
      message: string;
      indicators: string[];
    };

function hasText(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : value != null;
}

function norm(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function assertAdminMarkPaidNotMonthlyInvoiceChild(
  row: AdminMarkPaidMonthlyChildRow,
): AdminMarkPaidMonthlyChildGuardResult {
  const indicators: string[] = [];

  if (hasText(row.monthly_invoice_id)) indicators.push("monthly_invoice_id");
  if (norm(row.payment_status) === "pending_monthly") indicators.push("payment_status_pending_monthly");
  if (row.is_monthly_billing_booking === true) indicators.push("is_monthly_billing_booking");
  if (norm(row.billing_type) === "monthly") indicators.push("billing_type_monthly");

  if (indicators.length === 0) return { ok: true };

  return {
    ok: false,
    code: ADMIN_MARK_PAID_MONTHLY_CHILD_BLOCK_CODE,
    message:
      "Monthly invoice-backed child bookings must be settled through the monthly invoice payment flow, not individual admin mark-paid.",
    indicators,
  };
}
