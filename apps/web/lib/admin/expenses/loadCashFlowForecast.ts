import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPayoutRows } from "@/lib/payout/payoutQueryPagination";
import { buildCashFlowForecast, configuredMonthlyPayoutDay, type ForecastRow } from "./cashFlowForecast";

export async function loadCashFlowForecast(admin: SupabaseClient, from: string, to: string) {
  const [invoices, payouts, recurring, generated] = await Promise.all([
    fetchAllPayoutRows<ForecastRow>((a, b) => admin.from("monthly_invoices")
      .select("id, month, status, balance_cents, due_date, payment_arrangement_active, promised_payment_date, is_closed, currency_code")
      .in("status", ["sent", "partially_paid", "overdue"]).order("id").range(a, b)),
    fetchAllPayoutRows<ForecastRow>((a, b) => admin.from("cleaner_payouts")
      .select("id, status, payment_status, paid_at, period_start, period_end, total_amount_cents")
      .in("status", ["pending", "frozen", "approved"]).order("id").range(a, b)),
    fetchAllPayoutRows<ForecastRow>((a, b) => admin.from("recurring_expenses")
      .select("id, description, status, amount_cents, frequency, next_run_date")
      .eq("status", "active").order("id").range(a, b)),
    fetchAllPayoutRows<ForecastRow>((a, b) => admin.from("expenses")
      .select("id, description, expense_date, recurring_expense_id, status, amount_cents")
      .not("recurring_expense_id", "is", null).lte("expense_date", to)
      .in("status", ["pending", "approved"]).order("id").range(a, b)),
  ]);
  return buildCashFlowForecast(from, to, invoices, payouts, recurring, generated, configuredMonthlyPayoutDay());
}
