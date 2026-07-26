"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  AlertTriangle,
  Banknote,
  BarChart3,
  Building2,
  DollarSign,
  Minus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
  Clock,
  CreditCard,
  PiggyBank,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  OfficeZohoMetricCard,
  OfficeZohoMetricsRow,
  OfficeZohoPageHeader,
  OfficeZohoSecondaryButton,
} from "@/components/admin/office/OfficeZohoChrome";
import { FinanceKpiCard } from "@/components/admin/finance/FinanceKpiCard";
import { useAdminData } from "@/hooks/useAdminData";
import type { FinancialDashboardPayload } from "@/lib/admin/expenses/loadFinancialDashboard";
import { defaultOfficePayoutPeriodRange } from "@/lib/admin/payouts/officePayoutPeriodReport";
import { cn } from "@/lib/utils";

const CHART_COLORS = ["#408df7", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#64748b"];

function formatZar(cents: number): string {
  return `R ${Math.round(cents / 100).toLocaleString("en-ZA")}`;
}

function GrowthBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-slate-400">—</span>;
  const up = value >= 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", up ? "text-emerald-600" : "text-red-600")}>
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(value)}%
    </span>
  );
}

function ProfitBreakdownBar({ profit }: { profit: FinancialDashboardPayload["profit"] }) {
  const segments = [
    { key: "payouts", label: "Cleaner payouts", value: profit.cleaner_payouts_cents, color: "bg-blue-500", legend: "bg-blue-500" },
    { key: "gross", label: "Gross margin", value: profit.gross_margin_cents, color: "bg-emerald-500", legend: "bg-emerald-500" },
    { key: "expenses", label: "Operating expenses", value: profit.operating_expenses_cents, color: "bg-amber-500", legend: "bg-amber-500" },
    { key: "net", label: "Net profit", value: Math.max(0, profit.net_profit_cents), color: "bg-violet-500", legend: "bg-violet-500" },
  ];
  const total = Math.max(profit.customer_revenue_cents, 1);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-slate-800">Profit breakdown</h2>
      <div className="mb-2 flex h-4 overflow-hidden rounded-full bg-slate-100">
        {segments.map((s) => {
          const w = (s.value / total) * 100;
          if (w <= 0) return null;
          return <div key={s.key} className={cn("h-full", s.color)} style={{ width: `${w}%` }} title={`${s.label}: ${formatZar(s.value)}`} />;
        })}
      </div>
      <div className="mb-4 text-center">
        <p className="text-xs text-slate-500">Customer revenue</p>
        <p className="text-2xl font-bold tabular-nums text-slate-900">{formatZar(profit.customer_revenue_cents)}</p>
      </div>
      <div className="space-y-2">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className={cn("h-2.5 w-2.5 rounded-full", s.legend)} />
              <span className="text-slate-600">{s.label}</span>
            </div>
            <span className="font-semibold tabular-nums text-slate-900">{formatZar(s.value)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-sm font-bold">
          <span className="text-slate-800">Net profit</span>
          <span className={cn("tabular-nums", profit.net_profit_cents >= 0 ? "text-emerald-700" : "text-red-600")}>
            {formatZar(profit.net_profit_cents)}
          </span>
        </div>
      </div>
    </section>
  );
}

export default function FinancialDashboardPage() {
  const defaults = defaultOfficePayoutPeriodRange();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);

  const params = useMemo(() => ({ from, to }), [from, to]);
  const { data, loading, error, refetch } = useAdminData<FinancialDashboardPayload>(
    "/api/admin/financial-dashboard",
    { params },
  );

  const profit = data?.profit;
  const cards = data?.summary_cards;

  const monthlyChart = (data?.monthly_trend ?? []).map((m) => ({
    month: m.month,
    Revenue: m.revenue_cents / 100,
    Expenses: m.expenses_cents / 100,
    "Net profit": m.net_profit_cents / 100,
  }));

  const categoryChart = (data?.expenses_by_category ?? []).slice(0, 8).map((c) => ({
    name: c.category,
    value: c.amount_cents / 100,
  }));

  const branchChart = (data?.expenses_by_branch ?? []).map((b) => ({
    name: b.branch_name,
    value: b.amount_cents / 100,
  }));

  return (
    <div className="space-y-6 p-4 md:p-6">
      <OfficeZohoPageHeader
        title="Executive financial dashboard"
        subtitle="True business profit — revenue, payouts, expenses, cash position, and net profit"
        live
        actions={
          <>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
            <span className="text-slate-400"><Minus className="h-4 w-4" /></span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
            <OfficeZohoSecondaryButton onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </OfficeZohoSecondaryButton>
            <Link href="/office/payment-reconciliation" className="text-sm font-medium text-[#408df7] hover:underline">
              Reconciliation →
            </Link>
            <Link href="/office/cash-flow" className="text-sm font-medium text-[#408df7] hover:underline">
              Cash flow →
            </Link>
            <Link href="/office/business-health" className="text-sm font-medium text-[#408df7] hover:underline">
              Health score →
            </Link>
          </>
        }
      />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {(data?.untrusted_incomplete_team?.booking_count ?? 0) > 0 ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            <span className="font-medium">Untrusted incomplete team bookings:</span>{" "}
            {data!.untrusted_incomplete_team.booking_count} booking
            {data!.untrusted_incomplete_team.booking_count === 1 ? "" : "s"} (
            {formatZar(data!.untrusted_incomplete_team.customer_revenue_cents)} operational revenue)
            excluded from trusted monthly/branch revenue, payout, margin, and profit rollups. See{" "}
            <Link href="/office/booking-profitability" className="font-medium text-[#408df7] hover:underline">
              Booking profitability
            </Link>
            .
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <FinanceKpiCard
          icon={DollarSign}
          label="Customer revenue"
          value={loading ? "—" : formatZar(profit?.customer_revenue_cents ?? 0)}
          growthPercent={cards?.revenue_growth_percent ?? null}
          sparkline={data?.executive_kpis?.sparkline?.map((s) => ({ value: s.revenue_cents }))}
          loading={loading}
          status="positive"
        />
        <FinanceKpiCard icon={Wallet} label="Cleaner payouts" value={loading ? "—" : formatZar(profit?.cleaner_payouts_cents ?? 0)} loading={loading} />
        <FinanceKpiCard icon={Building2} label="Gross margin" value={loading ? "—" : formatZar(profit?.gross_margin_cents ?? 0)} loading={loading} status="positive" />
        <FinanceKpiCard
          icon={TrendingDown}
          label="Operating expenses"
          value={loading ? "—" : formatZar(profit?.operating_expenses_cents ?? 0)}
          growthPercent={cards?.expense_growth_percent ?? null}
          loading={loading}
          status="warning"
        />
        <FinanceKpiCard
          icon={TrendingUp}
          label="Net profit"
          value={loading ? "—" : formatZar(profit?.net_profit_cents ?? 0)}
          growthPercent={cards?.profit_growth_percent ?? null}
          sparkline={data?.executive_kpis?.sparkline?.map((s) => ({ value: s.net_profit_cents }))}
          loading={loading}
          status={(profit?.net_profit_cents ?? 0) >= 0 ? "positive" : "negative"}
        />
        <FinanceKpiCard
          icon={BarChart3}
          label="Net profit margin"
          value={loading ? "—" : `${data?.executive_kpis?.net_profit_margin_percent ?? cards?.profit_margin_percent ?? "—"}%`}
          loading={loading}
        />
        <FinanceKpiCard
          icon={CreditCard}
          label="Outstanding payments"
          value={loading ? "—" : formatZar(data?.executive_kpis?.outstanding_customer_payments_cents ?? 0)}
          loading={loading}
          status="warning"
        />
        <FinanceKpiCard
          icon={Clock}
          label="Pending cleaner payouts"
          value={loading ? "—" : formatZar(data?.executive_kpis?.pending_cleaner_payouts_cents ?? 0)}
          loading={loading}
        />
        <FinanceKpiCard
          icon={Banknote}
          label="Cash in bank"
          value={loading ? "—" : formatZar(data?.executive_kpis?.cash_in_bank_cents ?? 0)}
          loading={loading}
        />
        <FinanceKpiCard
          icon={PiggyBank}
          label="Petty cash"
          value={loading ? "—" : formatZar(data?.executive_kpis?.petty_cash_balance_cents ?? 0)}
          loading={loading}
        />
        <FinanceKpiCard
          icon={CreditCard}
          label="Gateway fees (Paystack)"
          value={loading ? "—" : formatZar(data?.executive_kpis?.gateway_processing_fees_cents ?? 0)}
          loading={loading}
          status="warning"
        />
        <FinanceKpiCard
          icon={Banknote}
          label="Net settlement"
          value={loading ? "—" : formatZar(data?.executive_kpis?.net_settlement_cents ?? 0)}
          loading={loading}
          status="positive"
        />
        <FinanceKpiCard
          icon={TrendingUp}
          label="Avg booking profit"
          value={loading ? "—" : formatZar(cards?.avg_profit_per_booking_cents ?? 0)}
          loading={loading}
        />
      </div>

      <OfficeZohoMetricsRow meta={<span className="text-xs text-slate-400">Per-booking averages</span>}>
        <OfficeZohoMetricCard icon={BarChart3} label="Profit margin" value={loading ? "—" : `${cards?.profit_margin_percent ?? "—"}%`} />
        <OfficeZohoMetricCard icon={BarChart3} label="Expense ratio" value={loading ? "—" : `${cards?.expense_ratio_percent ?? "—"}%`} />
        <OfficeZohoMetricCard icon={DollarSign} label="Avg revenue / booking" value={loading ? "—" : formatZar(cards?.avg_revenue_per_booking_cents ?? 0)} />
        <OfficeZohoMetricCard icon={TrendingDown} label="Avg expense / booking" value={loading ? "—" : formatZar(cards?.avg_expense_per_booking_cents ?? 0)} />
        <OfficeZohoMetricCard icon={TrendingUp} label="Avg profit / booking" value={loading ? "—" : formatZar(cards?.avg_profit_per_booking_cents ?? 0)} />
      </OfficeZohoMetricsRow>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Revenue growth</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-lg font-bold">{loading ? "—" : formatZar(profit?.customer_revenue_cents ?? 0)}</span>
            <GrowthBadge value={cards?.revenue_growth_percent ?? null} />
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Expense growth</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-lg font-bold">{loading ? "—" : formatZar(profit?.operating_expenses_cents ?? 0)}</span>
            <GrowthBadge value={cards?.expense_growth_percent ?? null} />
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Profit growth</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-lg font-bold">{loading ? "—" : formatZar(profit?.net_profit_cents ?? 0)}</span>
            <GrowthBadge value={cards?.profit_growth_percent ?? null} />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {profit ? <ProfitBreakdownBar profit={profit} /> : null}

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Monthly revenue vs expenses</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R${v}`} />
                <Tooltip formatter={(v: number) => `R ${v.toLocaleString("en-ZA")}`} />
                <Legend />
                <Bar dataKey="Revenue" fill="#408df7" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Expenses" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Monthly net profit</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R${v}`} />
                <Tooltip formatter={(v: number) => `R ${v.toLocaleString("en-ZA")}`} />
                <Line type="monotone" dataKey="Net profit" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Expense by category</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categoryChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name }) => name}>
                  {categoryChart.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => `R ${v.toLocaleString("en-ZA")}`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Expense by branch</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={branchChart} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tickFormatter={(v) => `R${v}`} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => `R ${v.toLocaleString("en-ZA")}`} />
                <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {(data?.profit_by_branch ?? []).length > 0 ? (
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-slate-800">Profit by branch</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3">Branch</th>
                  <th className="px-5 py-3 text-right">Revenue</th>
                  <th className="px-5 py-3 text-right">Payouts</th>
                  <th className="px-5 py-3 text-right">Gross margin</th>
                  <th className="px-5 py-3 text-right">Expenses</th>
                  <th className="px-5 py-3 text-right">Net profit</th>
                  <th className="px-5 py-3 text-right">Bookings</th>
                  <th className="px-5 py-3 text-right">Avg profit</th>
                </tr>
              </thead>
              <tbody>
                {data!.profit_by_branch.map((row) => (
                  <tr key={row.branch_id} className="border-b border-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-800">{row.branch_name}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{formatZar(row.revenue_cents)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{formatZar(row.cleaner_payouts_cents)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-emerald-700">{formatZar(row.gross_margin_cents)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-amber-700">{formatZar(row.expenses_cents)}</td>
                    <td className={cn("px-5 py-3 text-right font-semibold tabular-nums", row.net_profit_cents >= 0 ? "text-violet-700" : "text-red-600")}>
                      {formatZar(row.net_profit_cents)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{row.booking_count}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{formatZar(row.avg_booking_profit_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
