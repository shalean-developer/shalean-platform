import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  bookingCustomerRevenueCents,
  loadOfficePayoutPeriodReport,
  normalizeOfficePayoutPeriodRange,
} from "@/lib/admin/payouts/officePayoutPeriodReport";
import { computeProfitBreakdown } from "@/lib/admin/expenses/profitCalculations";
import {
  loadExpensesByBranch,
  loadExpensesByCategory,
  sumApprovedExpensesInRange,
} from "@/lib/admin/expenses/loadExpenses";
import { resolveCleanerEarningsCents } from "@/lib/cleaner/resolveCleanerEarnings";
import { loadPaymentTransactionMetrics } from "@/lib/payments/loadPaymentTransactionMetrics";
import { isZohoConfigured } from "@/lib/accounting/zohoIntegrationSettings";
import { getZohoBankBalances } from "@/lib/zoho/zohoBooksService";

export type FinancialDashboardPayload = {
  period: { from: string; to: string };
  profit: ReturnType<typeof computeProfitBreakdown>;
  summary_cards: {
    profit_margin_percent: number | null;
    expense_ratio_percent: number | null;
    avg_revenue_per_booking_cents: number;
    avg_expense_per_booking_cents: number;
    avg_profit_per_booking_cents: number;
    revenue_growth_percent: number | null;
    expense_growth_percent: number | null;
    profit_growth_percent: number | null;
  };
  monthly_trend: Array<{
    month: string;
    revenue_cents: number;
    expenses_cents: number;
    net_profit_cents: number;
    gross_margin_cents: number;
    cleaner_payouts_cents: number;
  }>;
  expenses_by_category: Array<{ category: string; group: string; amount_cents: number; count: number }>;
  expenses_by_branch: Array<{ branch_id: string; branch_name: string; amount_cents: number; count: number }>;
  top_categories: Array<{ category: string; amount_cents: number }>;
  profit_by_branch: Array<{
    branch_id: string;
    branch_name: string;
    revenue_cents: number;
    cleaner_payouts_cents: number;
    gross_margin_cents: number;
    expenses_cents: number;
    net_profit_cents: number;
    booking_count: number;
    avg_booking_profit_cents: number;
  }>;
  executive_kpis: {
    outstanding_customer_payments_cents: number;
    pending_cleaner_payouts_cents: number;
    cash_in_bank_cents: number;
    petty_cash_balance_cents: number;
    net_profit_margin_percent: number | null;
    gateway_processing_fees_cents: number;
    net_settlement_cents: number;
    sparkline: Array<{ month: string; revenue_cents: number; expenses_cents: number; net_profit_cents: number }>;
  };
  gateway_payments: {
    gross_cents: number;
    processing_fee_cents: number;
    net_settlement_cents: number;
    transaction_count: number;
  };
};

function monthKey(ymd: string): string {
  return ymd.slice(0, 7);
}

function prevPeriod(from: string, to: string): { from: string; to: string } {
  const f = new Date(`${from}T12:00:00`);
  const t = new Date(`${to}T12:00:00`);
  const days = Math.max(1, Math.round((t.getTime() - f.getTime()) / 86400000) + 1);
  const prevTo = new Date(f);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - days + 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(prevFrom), to: fmt(prevTo) };
}

function growthPercent(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

type BookingFinancialRow = {
  id: string;
  date: string | null;
  city_id: string | null;
  total_paid_zar: number | null;
  amount_paid_cents: number | null;
  total_paid_cents: number | null;
  company_revenue_cents: number | null;
  earnings_summary?: unknown;
  cleaner_payout_cents: number | null;
  display_earnings_cents: number | null;
  cleaner_earnings_total_cents: number | null;
  cleaner_bonus_cents?: number | null;
  payout_frozen_cents?: number | null;
};

function bookingCleanerPayoutCents(b: BookingFinancialRow): number {
  const resolved = resolveCleanerEarningsCents(b);
  if (resolved != null && resolved > 0) return resolved;
  const cp = Number(b.cleaner_payout_cents);
  const cb = Number(b.cleaner_bonus_cents);
  return (Number.isFinite(cp) && cp > 0 ? Math.round(cp) : 0) + (Number.isFinite(cb) && cb > 0 ? Math.round(cb) : 0);
}

export async function loadFinancialDashboard(
  admin: SupabaseClient,
  fromRaw?: string | null,
  toRaw?: string | null,
  branchId?: string,
): Promise<FinancialDashboardPayload> {
  const { from, to } = normalizeOfficePayoutPeriodRange(fromRaw, toRaw);

  const report = await loadOfficePayoutPeriodReport(admin, from, to);
  const operatingExpenses = await sumApprovedExpensesInRange(admin, from, to, branchId);
  const gatewayPayments = await loadPaymentTransactionMetrics(admin, from, to, { branchId });

  const profit = computeProfitBreakdown(
    report.totals.total_revenue_cents,
    report.totals.earned_cents,
    operatingExpenses,
  );

  const visitCount = report.totals.visit_count ?? 0;
  const avgRevenuePerBooking = visitCount > 0 ? Math.round(profit.customer_revenue_cents / visitCount) : 0;
  const avgExpensePerBooking = visitCount > 0 ? Math.round(operatingExpenses / visitCount) : 0;
  const avgProfitPerBooking = visitCount > 0 ? Math.round(profit.net_profit_cents / visitCount) : 0;

  const prev = prevPeriod(from, to);
  const prevReport = await loadOfficePayoutPeriodReport(admin, prev.from, prev.to);
  const prevExpenses = await sumApprovedExpensesInRange(admin, prev.from, prev.to, branchId);
  const prevProfit = computeProfitBreakdown(
    prevReport.totals.total_revenue_cents,
    prevReport.totals.earned_cents,
    prevExpenses,
  );

  const expensesByCategory = await loadExpensesByCategory(admin, from, to, branchId);
  const expensesByBranch = await loadExpensesByBranch(admin, from, to);

  let bookingsQuery = admin
    .from("bookings")
    .select(
      "id, date, city_id, total_paid_zar, amount_paid_cents, total_paid_cents, company_revenue_cents, earnings_summary, cleaner_payout_cents, display_earnings_cents, cleaner_earnings_total_cents, cleaner_bonus_cents, payout_frozen_cents",
    )
    .eq("status", "completed")
    .eq("is_test", false)
    .gte("date", from)
    .lte("date", to);
  if (branchId) bookingsQuery = bookingsQuery.eq("city_id", branchId);
  const { data: bookingRows } = await bookingsQuery;
  const bookings = (bookingRows ?? []) as BookingFinancialRow[];

  const monthlyMap = new Map<string, { revenue: number; payouts: number; expenses: number }>();
  const branchRevenue = new Map<string, { revenue: number; payouts: number; bookings: number }>();

  for (const b of bookings) {
    const mk = monthKey(b.date ?? from);
    const m = monthlyMap.get(mk) ?? { revenue: 0, payouts: 0, expenses: 0 };
    const rev = bookingCustomerRevenueCents(b);
    const payout = bookingCleanerPayoutCents(b);
    m.revenue += rev;
    m.payouts += payout;
    monthlyMap.set(mk, m);

    const bid = b.city_id ?? "unknown";
    const br = branchRevenue.get(bid) ?? { revenue: 0, payouts: 0, bookings: 0 };
    br.revenue += rev;
    br.payouts += payout;
    br.bookings += 1;
    branchRevenue.set(bid, br);
  }

  const { data: monthlyExpenses } = await admin
    .from("expenses")
    .select("amount_cents, expense_date")
    .eq("status", "approved")
    .gte("expense_date", from)
    .lte("expense_date", to);

  for (const e of monthlyExpenses ?? []) {
    const mk = monthKey(e.expense_date);
    const m = monthlyMap.get(mk) ?? { revenue: 0, payouts: 0, expenses: 0 };
    m.expenses += e.amount_cents ?? 0;
    monthlyMap.set(mk, m);
  }

  const monthlyTrend = [...monthlyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => {
      const grossMargin = v.revenue - v.payouts;
      return {
        month,
        revenue_cents: v.revenue,
        expenses_cents: v.expenses,
        gross_margin_cents: grossMargin,
        cleaner_payouts_cents: v.payouts,
        net_profit_cents: grossMargin - v.expenses,
      };
    });

  const { data: cities } = await admin.from("cities").select("id, name");
  const cityNames = new Map((cities ?? []).map((c) => [c.id, c.name]));

  const profitByBranch = expensesByBranch.map((eb) => {
    const rev = branchRevenue.get(eb.branch_id);
    const revenue = rev?.revenue ?? 0;
    const payouts = rev?.payouts ?? 0;
    const grossMargin = revenue - payouts;
    const bookingCount = rev?.bookings ?? 0;
    const netProfit = grossMargin - eb.amount_cents;
    return {
      branch_id: eb.branch_id,
      branch_name: eb.branch_name || cityNames.get(eb.branch_id) || "Unknown",
      revenue_cents: revenue,
      cleaner_payouts_cents: payouts,
      gross_margin_cents: grossMargin,
      expenses_cents: eb.amount_cents,
      net_profit_cents: netProfit,
      booking_count: bookingCount,
      avg_booking_profit_cents: bookingCount > 0 ? Math.round(netProfit / bookingCount) : 0,
    };
  });

  for (const [bid, rev] of branchRevenue) {
    if (!profitByBranch.some((p) => p.branch_id === bid)) {
      const grossMargin = rev.revenue - rev.payouts;
      const netProfit = grossMargin;
      profitByBranch.push({
        branch_id: bid,
        branch_name: cityNames.get(bid) ?? "Unknown",
        revenue_cents: rev.revenue,
        cleaner_payouts_cents: rev.payouts,
        gross_margin_cents: grossMargin,
        expenses_cents: 0,
        net_profit_cents: netProfit,
        booking_count: rev.bookings,
        avg_booking_profit_cents: rev.bookings > 0 ? Math.round(netProfit / rev.bookings) : 0,
      });
    }
  }

  const [{ data: accounts }, { data: pendingInvoices }, { data: pendingPayouts }] = await Promise.all([
    admin.from("expense_accounts").select("account_type, balance_cents").eq("is_active", true),
    admin
      .from("monthly_invoices")
      .select("balance_cents")
      .in("status", ["sent", "partially_paid", "overdue"]),
    admin
      .from("cleaner_payouts")
      .select("total_amount_cents")
      .in("status", ["pending", "frozen", "approved"]),
  ]);

  let cashInBank = 0;
  let pettyCash = 0;
  for (const a of accounts ?? []) {
    const bal = a.balance_cents ?? 0;
    if (a.account_type === "petty_cash") pettyCash += bal;
    else if (a.account_type === "bank" || a.account_type === "paystack") cashInBank += bal;
  }

  if (isZohoConfigured()) {
    const zohoBalances = await getZohoBankBalances();
    if (zohoBalances.ok) {
      cashInBank = zohoBalances.cashInBankCents;
      pettyCash = zohoBalances.pettyCashCents;
    }
  }

  const outstandingCustomer = (pendingInvoices ?? []).reduce((s, r) => s + (r.balance_cents ?? 0), 0);
  const pendingCleaner = (pendingPayouts ?? []).reduce((s, r) => s + (r.total_amount_cents ?? 0), 0);

  return {
    period: { from, to },
    profit,
    summary_cards: {
      profit_margin_percent: profit.net_profit_percent,
      expense_ratio_percent: profit.expense_ratio_percent,
      avg_revenue_per_booking_cents: avgRevenuePerBooking,
      avg_expense_per_booking_cents: avgExpensePerBooking,
      avg_profit_per_booking_cents: avgProfitPerBooking,
      revenue_growth_percent: growthPercent(profit.customer_revenue_cents, prevProfit.customer_revenue_cents),
      expense_growth_percent: growthPercent(operatingExpenses, prevExpenses),
      profit_growth_percent: growthPercent(profit.net_profit_cents, prevProfit.net_profit_cents),
    },
    monthly_trend: monthlyTrend,
    expenses_by_category: expensesByCategory,
    expenses_by_branch: expensesByBranch,
    top_categories: expensesByCategory.slice(0, 8).map((c) => ({
      category: c.category,
      amount_cents: c.amount_cents,
    })),
    profit_by_branch: profitByBranch.sort((a, b) => b.net_profit_cents - a.net_profit_cents),
    executive_kpis: {
      outstanding_customer_payments_cents: outstandingCustomer,
      pending_cleaner_payouts_cents: pendingCleaner,
      cash_in_bank_cents: cashInBank,
      petty_cash_balance_cents: pettyCash,
      net_profit_margin_percent: profit.net_profit_percent,
      gateway_processing_fees_cents: gatewayPayments.processing_fee_cents,
      net_settlement_cents: gatewayPayments.net_settlement_cents,
      sparkline: monthlyTrend.slice(-6).map((m) => ({
        month: m.month,
        revenue_cents: m.revenue_cents,
        expenses_cents: m.expenses_cents,
        net_profit_cents: m.net_profit_cents,
      })),
    },
    gateway_payments: gatewayPayments,
  };
}
