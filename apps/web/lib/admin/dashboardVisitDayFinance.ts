/**
 * Visit-day finance for the office dashboard schedule panel.
 *
 * Distinct from {@link computeAdminDashboardRevenueSummary}, which buckets by
 * `payment_completed_at` (cash-in day). This module buckets by `bookings.date`
 * (service day) so operators can reconcile completed visits vs collected cash.
 */

import {
  adminDashboardRevenueCents,
  isAdminDashboardRevenueEligible,
  type AdminDashboardRevenueRow,
} from "@/lib/admin/dashboardRevenue";

export const OFFICE_VISIT_DAY_FINANCE_SCOPE =
  "Visit-date booking paid value (Africa/Johannesburg calendar day). Uses booking payment fields; monthly invoice child rows are reported separately and excluded from paid visit totals to avoid double-counting invoice collections.";

export type OfficeVisitDayFinanceRow = {
  id: string;
  status: string | null;
  payment_status?: string | null;
  payment_completed_at?: string | null;
  payment_method?: string | null;
  total_paid_zar?: number | string | null;
  amount_paid_cents?: number | string | null;
  total_price?: number | string | null;
  refunded_at?: string | null;
  refund_status?: string | null;
  billing_type?: string | null;
  is_monthly_billing_booking?: boolean | null;
  monthly_invoice_id?: string | null;
};

export type OfficeVisitDayFinance = {
  /** Paid, revenue-eligible bookings on this visit date (excludes monthly children). */
  paidValueZar: number;
  paidCount: number;
  /** Completed visits with no eligible payment evidence. */
  unpaidCompletedCount: number;
  unpaidCompletedQuotedZar: number;
  /** Completed visits that are paid + revenue-eligible. */
  completedPaidCount: number;
  completedPaidValueZar: number;
  /** Monthly invoice children on this visit date (excluded from paidValueZar). */
  monthlyChildCount: number;
  monthlyChildPaidZar: number;
  /** Sum of quoted `total_price` across non-cancelled rows. */
  quotedTotalZar: number;
  byPaymentMethod: Record<string, { count: number; zar: number }>;
  byPaymentStatus: Record<string, number>;
  scope: string;
};

const TERMINAL_SKIP = new Set(["cancelled", "failed", "payment_expired"]);
const MONTHLY_CHILD_BILLING_TYPES = new Set(["recurring_invoice", "monthly_contract"]);

function norm(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function hasText(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : value != null;
}

function isMonthlyChild(row: OfficeVisitDayFinanceRow): boolean {
  if (hasText(row.monthly_invoice_id)) return true;
  if (row.is_monthly_billing_booking === true) return true;
  return MONTHLY_CHILD_BILLING_TYPES.has(norm(row.billing_type));
}

function toRevenueRow(row: OfficeVisitDayFinanceRow): AdminDashboardRevenueRow {
  return {
    id: row.id,
    status: row.status,
    payment_status: row.payment_status ?? null,
    payment_completed_at: row.payment_completed_at ?? null,
    total_paid_zar: row.total_paid_zar ?? null,
    amount_paid_cents: row.amount_paid_cents ?? null,
    refunded_at: row.refunded_at ?? null,
    refund_status: row.refund_status ?? null,
    billing_type: row.billing_type ?? null,
    is_monthly_billing_booking: row.is_monthly_billing_booking ?? null,
    monthly_invoice_id: row.monthly_invoice_id ?? null,
  };
}

function quotedZar(row: OfficeVisitDayFinanceRow): number {
  const price = Number(row.total_price);
  if (Number.isFinite(price) && price > 0) return Math.round(price);
  const cents = adminDashboardRevenueCents(toRevenueRow(row));
  return cents > 0 ? Math.round(cents / 100) : 0;
}

export function computeOfficeVisitDayFinance(rows: OfficeVisitDayFinanceRow[]): OfficeVisitDayFinance {
  let paidValueCents = 0;
  let paidCount = 0;
  let unpaidCompletedCount = 0;
  let unpaidCompletedQuotedZar = 0;
  let completedPaidCount = 0;
  let completedPaidCents = 0;
  let monthlyChildCount = 0;
  let monthlyChildPaidCents = 0;
  let quotedTotalZar = 0;
  const byPaymentMethod: Record<string, { count: number; zar: number }> = {};
  const byPaymentStatus: Record<string, number> = {};

  for (const row of rows) {
    const st = norm(row.status);
    const ps = norm(row.payment_status) || "unknown";
    byPaymentStatus[ps] = (byPaymentStatus[ps] ?? 0) + 1;

    if (TERMINAL_SKIP.has(st)) continue;

    quotedTotalZar += quotedZar(row);

    const monthly = isMonthlyChild(row);
    const revenueRow = toRevenueRow(row);
    const eligible = isAdminDashboardRevenueEligible(revenueRow);
    const cents = adminDashboardRevenueCents(revenueRow);

    if (monthly) {
      monthlyChildCount += 1;
      if (cents > 0 && norm(row.payment_status) === "success") {
        monthlyChildPaidCents += cents;
      }
    } else if (eligible) {
      paidValueCents += cents;
      paidCount += 1;
      const method = norm(row.payment_method) || "unspecified";
      const bucket = byPaymentMethod[method] ?? { count: 0, zar: 0 };
      bucket.count += 1;
      bucket.zar += Math.round(cents / 100);
      byPaymentMethod[method] = bucket;
    }

    if (st === "completed") {
      if (monthly) {
        // Monthly children are billed via invoices — not unpaid visit cash.
      } else if (eligible) {
        completedPaidCount += 1;
        completedPaidCents += cents;
      } else {
        unpaidCompletedCount += 1;
        unpaidCompletedQuotedZar += quotedZar(row);
      }
    }
  }

  return {
    paidValueZar: Math.round(paidValueCents / 100),
    paidCount,
    unpaidCompletedCount,
    unpaidCompletedQuotedZar,
    completedPaidCount,
    completedPaidValueZar: Math.round(completedPaidCents / 100),
    monthlyChildCount,
    monthlyChildPaidZar: Math.round(monthlyChildPaidCents / 100),
    quotedTotalZar,
    byPaymentMethod,
    byPaymentStatus,
    scope: OFFICE_VISIT_DAY_FINANCE_SCOPE,
  };
}
