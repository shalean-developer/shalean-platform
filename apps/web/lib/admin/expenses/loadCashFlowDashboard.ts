import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sumApprovedExpensesInRange } from "@/lib/admin/expenses/loadExpenses";
import {
  bookingCustomerRevenueCents,
  loadOfficePayoutPeriodReport,
  normalizeOfficePayoutPeriodRange,
} from "@/lib/admin/payouts/officePayoutPeriodReport";
import { computeProfitBreakdown } from "@/lib/admin/expenses/profitCalculations";
import { loadPaymentTransactionMetrics } from "@/lib/payments/loadPaymentTransactionMetrics";
import { loadSettlementCashSummary } from "@/lib/payments/loadSettlementCashSummary";

export type CashFlowDashboardPayload = {
  period: { from: string; to: string };
  summary: {
    money_received_cents: number;
    money_received_net_cents: number;
    gateway_processing_fees_cents: number;
    money_paid_cents: number;
    cash_in_bank_cents: number;
    petty_cash_cents: number;
    paystack_in_transit_cents: number;
    expected_income_cents: number;
    expected_expenses_cents: number;
    net_cash_flow_cents: number;
    cash_runway_days: number | null;
  };
  daily_position: Array<{
    date: string;
    cash_in_cents: number;
    cash_out_cents: number;
    net_cents: number;
    cumulative_cents: number;
  }>;
  weekly_position: Array<{
    week: string;
    cash_in_cents: number;
    cash_out_cents: number;
    net_cents: number;
  }>;
  monthly_position: Array<{
    month: string;
    cash_in_cents: number;
    cash_out_cents: number;
    net_cents: number;
  }>;
};

function isoWeekKey(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function loadCashFlowDashboard(
  admin: SupabaseClient,
  fromRaw?: string | null,
  toRaw?: string | null,
): Promise<CashFlowDashboardPayload> {
  const { from, to } = normalizeOfficePayoutPeriodRange(fromRaw, toRaw);
  const [report, approvedExpenses, gatewayMetrics, settlementSummary] = await Promise.all([
    loadOfficePayoutPeriodReport(admin, from, to),
    sumApprovedExpensesInRange(admin, from, to),
    loadPaymentTransactionMetrics(admin, from, to),
    loadSettlementCashSummary(admin, { from, to }),
  ]);

  const { data: accounts } = await admin
    .from("expense_accounts")
    .select("account_type, balance_cents, is_active")
    .eq("is_active", true);

  let cashInBank = 0;
  let pettyCash = 0;
  for (const a of accounts ?? []) {
    const bal = a.balance_cents ?? 0;
    if (a.account_type === "petty_cash") pettyCash += bal;
    else if (a.account_type === "bank") cashInBank += bal;
  }

  const moneyReceived = report.totals.total_revenue_cents;
  const moneyReceivedNet = settlementSummary.settled_to_bank_cents;
  const moneyPaid = (report.totals.paid_cents ?? 0) + approvedExpenses;

  const { data: settledPaymentTxRows } = await admin
    .from("payment_transactions")
    .select("settlement_date, net_settlement_cents, amount_cents")
    .eq("gateway", "paystack")
    .eq("settlement_status", "settled")
    .gte("settlement_date", from)
    .lte("settlement_date", to);

  const { data: pendingInvoices } = await admin
    .from("monthly_invoices")
    .select("balance_cents")
    .in("status", ["sent", "partially_paid", "overdue"]);

  const expectedIncome = (pendingInvoices ?? []).reduce((s, r) => s + (r.balance_cents ?? 0), 0);

  const { data: pendingPayouts } = await admin
    .from("cleaner_payouts")
    .select("total_amount_cents")
    .in("status", ["pending", "frozen", "approved"]);

  const { data: pendingRecurring } = await admin
    .from("recurring_expenses")
    .select("amount_cents")
    .eq("status", "active")
    .gte("next_run_date", from)
    .lte("next_run_date", to);

  const expectedExpenses =
    (pendingPayouts ?? []).reduce((s, r) => s + (r.total_amount_cents ?? 0), 0) +
    (pendingRecurring ?? []).reduce((s, r) => s + (r.amount_cents ?? 0), 0);

  // Net cash flow is actual settled bank inflow less actual/approved outflow. Pending
  // Paystack settlements are shown separately and are not treated as cash received.
  const netCashFlow = moneyReceivedNet - moneyPaid;
  const avgDailyBurn = moneyPaid / Math.max(1, report.totals.visit_count || 30);
  const cashRunwayDays =
    avgDailyBurn > 0 ? Math.round((cashInBank + pettyCash) / avgDailyBurn) : null;

  const { data: expenseRows } = await admin
    .from("expenses")
    .select("expense_date, amount_cents")
    .eq("status", "approved")
    .gte("expense_date", from)
    .lte("expense_date", to);

  const { data: payoutRows } = await admin
    .from("cleaner_payouts")
    .select("paid_at, total_amount_cents")
    .eq("status", "paid")
    .gte("paid_at", `${from}T00:00:00`)
    .lte("paid_at", `${to}T23:59:59`);

  const dailyMap = new Map<string, { in: number; out: number }>();

  for (const tx of settledPaymentTxRows ?? []) {
    const d = tx.settlement_date ?? from;
    const row = dailyMap.get(d) ?? { in: 0, out: 0 };
    row.in += tx.net_settlement_cents ?? tx.amount_cents ?? 0;
    dailyMap.set(d, row);
  }

  for (const e of expenseRows ?? []) {
    const row = dailyMap.get(e.expense_date) ?? { in: 0, out: 0 };
    row.out += e.amount_cents ?? 0;
    dailyMap.set(e.expense_date, row);
  }
  for (const p of payoutRows ?? []) {
    const d = p.paid_at?.slice(0, 10) ?? from;
    const row = dailyMap.get(d) ?? { in: 0, out: 0 };
    row.out += p.total_amount_cents ?? 0;
    dailyMap.set(d, row);
  }

  const sortedDays = [...dailyMap.entries()].sort(([a], [b]) => a.localeCompare(b));
  let cumulative = 0;
  const dailyPosition = sortedDays.map(([date, v]) => {
    const net = v.in - v.out;
    cumulative += net;
    return {
      date,
      cash_in_cents: v.in,
      cash_out_cents: v.out,
      net_cents: net,
      cumulative_cents: cumulative,
    };
  });

  const weeklyMap = new Map<string, { in: number; out: number }>();
  const monthlyMap = new Map<string, { in: number; out: number }>();
  for (const d of dailyPosition) {
    const wk = isoWeekKey(d.date);
    const mo = d.date.slice(0, 7);
    const w = weeklyMap.get(wk) ?? { in: 0, out: 0 };
    w.in += d.cash_in_cents;
    w.out += d.cash_out_cents;
    weeklyMap.set(wk, w);
    const m = monthlyMap.get(mo) ?? { in: 0, out: 0 };
    m.in += d.cash_in_cents;
    m.out += d.cash_out_cents;
    monthlyMap.set(mo, m);
  }

  return {
    period: { from, to },
    summary: {
      money_received_cents: moneyReceived,
      money_received_net_cents: moneyReceivedNet,
      gateway_processing_fees_cents: gatewayMetrics.processing_fee_cents,
      money_paid_cents: moneyPaid,
      cash_in_bank_cents: cashInBank,
      petty_cash_cents: pettyCash,
      paystack_in_transit_cents: settlementSummary.verified_in_transit_cents,
      expected_income_cents: expectedIncome,
      expected_expenses_cents: expectedExpenses,
      net_cash_flow_cents: netCashFlow,
      cash_runway_days: cashRunwayDays,
    },
    daily_position: dailyPosition,
    weekly_position: [...weeklyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, v]) => ({
        week,
        cash_in_cents: v.in,
        cash_out_cents: v.out,
        net_cents: v.in - v.out,
      })),
    monthly_position: [...monthlyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({
        month,
        cash_in_cents: v.in,
        cash_out_cents: v.out,
        net_cents: v.in - v.out,
      })),
  };
}

/** Quick profit snapshot for health score (last 30 days vs prior 30). */
export async function loadProfitSnapshot(admin: SupabaseClient, days = 30) {
  const to = new Date().toISOString().slice(0, 10);
  const fromD = new Date();
  fromD.setDate(fromD.getDate() - days);
  const from = fromD.toISOString().slice(0, 10);

  const prevToD = new Date(fromD);
  prevToD.setDate(prevToD.getDate() - 1);
  const prevTo = prevToD.toISOString().slice(0, 10);
  const prevFromD = new Date(prevToD);
  prevFromD.setDate(prevFromD.getDate() - days + 1);
  const prevFrom = prevFromD.toISOString().slice(0, 10);

  const [curReport, prevReport, curExp, prevExp] = await Promise.all([
    loadOfficePayoutPeriodReport(admin, from, to),
    loadOfficePayoutPeriodReport(admin, prevFrom, prevTo),
    sumApprovedExpensesInRange(admin, from, to),
    sumApprovedExpensesInRange(admin, prevFrom, prevTo),
  ]);

  const current = computeProfitBreakdown(
    curReport.totals.total_revenue_cents,
    curReport.totals.earned_cents,
    curExp,
  );
  const previous = computeProfitBreakdown(
    prevReport.totals.total_revenue_cents,
    prevReport.totals.earned_cents,
    prevExp,
  );

  return { current, previous, period: { from, to } };
}
