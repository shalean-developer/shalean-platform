import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInvoiceMonth } from "@/lib/admin/invoices/invoiceAdminFormatters";
import { johannesburgMonthKey } from "@/lib/dashboard/johannesburgMonth";
import { sumEstimatedMonthlyRevenue, type RecurringRevenuePlanInput } from "@/lib/recurring/estimateMonthlyRevenue";

export type RecurringPageSummary = {
  month: string;
  month_label: string;
  active_plan_count: number;
  estimated_monthly_revenue_zar: number;
  current_month_draft_total_cents: number;
  current_month_draft_balance_cents: number;
  current_month_draft_invoice_count: number;
};

function invoiceBalanceCents(inv: {
  total_amount_cents: unknown;
  amount_paid_cents: unknown;
  balance_cents: unknown;
}): number {
  const total = Math.round(Number(inv.total_amount_cents ?? 0));
  const paid = Math.round(Number(inv.amount_paid_cents ?? 0));
  const balanceRaw = inv.balance_cents;
  if (typeof balanceRaw === "number" && Number.isFinite(balanceRaw)) return Math.round(balanceRaw);
  return Math.max(0, total - paid);
}

export type RecurringPageSummaryPlanInput = RecurringRevenuePlanInput & {
  customer_id: string;
};

export async function loadRecurringPageSummary(
  admin: SupabaseClient,
  plans: RecurringPageSummaryPlanInput[],
): Promise<RecurringPageSummary> {
  const month = johannesburgMonthKey();
  const month_label = formatInvoiceMonth(month);
  const activePlans = plans.filter((p) => p.status.toLowerCase() === "active");
  const activeCustomerIds = [...new Set(activePlans.map((p) => p.customer_id))];

  let current_month_draft_total_cents = 0;
  let current_month_draft_balance_cents = 0;
  let current_month_draft_invoice_count = 0;

  if (activeCustomerIds.length > 0) {
    const { data: invoices, error } = await admin
      .from("monthly_invoices")
      .select("total_amount_cents, amount_paid_cents, balance_cents, status, customer_id")
      .eq("month", month)
      .eq("status", "draft")
      .in("customer_id", activeCustomerIds);

    if (error) throw new Error(error.message);

    for (const inv of invoices ?? []) {
      current_month_draft_invoice_count += 1;
      current_month_draft_total_cents += Math.round(Number(inv.total_amount_cents ?? 0));
      current_month_draft_balance_cents += Math.max(0, invoiceBalanceCents(inv));
    }
  }

  return {
    month,
    month_label,
    active_plan_count: activePlans.length,
    estimated_monthly_revenue_zar: sumEstimatedMonthlyRevenue(activePlans),
    current_month_draft_total_cents,
    current_month_draft_balance_cents,
    current_month_draft_invoice_count,
  };
}
