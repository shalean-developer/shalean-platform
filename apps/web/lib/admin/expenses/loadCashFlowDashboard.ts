import "server-only";

import { loadCashFlowForecast } from "./loadCashFlowForecast";
import type { CashFlowForecast } from "./cashFlowForecast";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sumApprovedExpensesInRange } from "@/lib/admin/expenses/loadExpenses";
import {
  bookingCustomerRevenueCents,
  normalizeOfficePayoutPeriodRange,
} from "@/lib/admin/payouts/officePayoutPeriodReport";
import { computeProfitBreakdown } from "@/lib/admin/expenses/profitCalculations";
import { loadCashFlowPaymentEvidence } from "@/lib/payments/loadCashFlowPaymentEvidence";
import { loadSettlementCashSummary } from "@/lib/payments/loadSettlementCashSummary";
import { loadRecordedSettlementsByDate } from "@/lib/payments/loadRecordedSettlementsByDate";
import { loadRecordedCleanerPayoutCash } from "@/lib/payments/loadRecordedCleanerPayoutCash";
import { loadRecordedExpenseCash } from "@/lib/payments/loadRecordedExpenseCash";

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
  payment_evidence: Awaited<ReturnType<typeof loadCashFlowPaymentEvidence>>;
  forecast: CashFlowForecast;
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
  const [recordedExpenses, gatewayMetrics, settlementSummary] = await Promise.all([
    loadRecordedExpenseCash(admin, from, to),
    loadCashFlowPaymentEvidence(admin, from, to),
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

  const moneyReceived = gatewayMetrics.gross_cents;
  // Bank-settlement totals use the settlement-date range (not the customer paid_at range).
  // Share the exact same selected rows with the daily/weekly/monthly charts.
  const recordedSettlements = await loadRecordedSettlementsByDate(admin, from, to);
  const moneyReceivedNet = recordedSettlements.settled_to_bank_cents;
  // Paid booking allocations are earned by service date, not money leaving the bank.
  // One paid batch is counted once on its actual payment date.
  const paidCleanerCash = await loadRecordedCleanerPayoutCash(admin, from, to);
  // Paystack-linked fee expenses are retained in the expense ledger but not
  // deducted again from bank inflows already net of Paystack processing fees.
  const moneyPaid = paidCleanerCash.paid_cents + recordedExpenses.cash_out_cents;

  const forecast = await loadCashFlowForecast(admin, from, to);

  // Net cash flow is actual settled bank inflow less actual/approved outflow. Pending
  // Paystack settlements are shown separately and are not treated as cash received.
  const netCashFlow = moneyReceivedNet - moneyPaid;

  const dailyMap = new Map<string, { in: number; out: number }>();

  for (const tx of recordedSettlements.by_date) {
    const row = dailyMap.get(tx.date) ?? { in: 0, out: 0 };
    row.in += tx.cash_in_cents;
    dailyMap.set(tx.date, row);
  }

  for (const e of recordedExpenses.by_date) {
    const row = dailyMap.get(e.date) ?? { in: 0, out: 0 };
    row.out += e.cash_out_cents;
    dailyMap.set(e.date, row);
  }
  for (const p of paidCleanerCash.by_date) {
    const row = dailyMap.get(p.date) ?? { in: 0, out: 0 };
    row.out += p.cash_out_cents;
    dailyMap.set(p.date, row);
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
      gateway_processing_fees_cents: gatewayMetrics.reported_fee_cents,
      money_paid_cents: moneyPaid,
      cash_in_bank_cents: cashInBank,
      petty_cash_cents: pettyCash,
      paystack_in_transit_cents: settlementSummary.in_transit_cents,
      expected_income_cents: forecast.income_cents,
      expected_expenses_cents: forecast.expenses_cents,
      net_cash_flow_cents: netCashFlow,
      // CF-02: visit count is not elapsed days; unreconciled cash is not a runway basis.
      cash_runway_days: null,
    },
    payment_evidence: gatewayMetrics,
    forecast,
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
