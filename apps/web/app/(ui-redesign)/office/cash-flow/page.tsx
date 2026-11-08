"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownLeft, ArrowUpRight, Banknote, PiggyBank, RefreshCw, TrendingUp, Wallet } from "lucide-react";
import { CashFlowDetails } from "@/components/admin/finance/CashFlowDetails";
import { FinanceKpiCard } from "@/components/admin/finance/FinanceKpiCard";
import { CashFlowForecastBreakdown, formatForecastZar } from "@/components/admin/finance/CashFlowForecastBreakdown";
import { CashReconciliationPanel } from "@/components/admin/finance/CashReconciliationPanel";
import type { CashReconciliation } from "@/lib/admin/expenses/cashReconciliation";
import { useAdminData } from "@/hooks/useAdminData";
import type { CashSurvivalDashboardPayload } from "@/lib/admin/expenses/loadCashSurvivalDashboard";
import type { CashFlowDashboardPayload } from "@/lib/admin/expenses/loadCashFlowDashboard";
import { defaultOfficePayoutPeriodRange } from "@/lib/admin/payouts/officePayoutPeriodReport";

function formatZar(cents: number): string {
  return formatForecastZar(cents);
}

export default function CashFlowPage() {
  const defaults = defaultOfficePayoutPeriodRange();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [scenario, setScenario] = useState("differences");
  const evidenceParams = useMemo(() => ({ scenario }), [scenario]);
  const params = useMemo(() => ({ from, to }), [from, to]);
  const periodValid = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;

  const { data, loading, error, refetch } = useAdminData<CashFlowDashboardPayload>("/api/admin/cash-flow", {
    params, enabled: periodValid,
  });
  const {
    data: reconciliation,
    loading: reconciliationLoading,
    error: reconciliationError,
    refetch: refetchReconciliation,
  } = useAdminData<CashReconciliation>("/api/admin/cash-reconciliation", { params: evidenceParams });

  const { data: obligations, loading: obligationsLoading, error: obligationsError, refetch: refetchObligations } = useAdminData<CashSurvivalDashboardPayload>("/api/admin/cash-survival", { params, enabled: periodValid });
  const obligationsCurrent = periodValid && !obligationsLoading && !obligationsError && obligations?.period.from === from && obligations?.period.to === to;
  const obligationAmount = (value?: number) => !obligationsCurrent || value == null ? "Unavailable" : formatZar(value);

  const s = data?.summary;
  const forecastCurrent = periodValid && !loading && !error && data?.period.from === from && data?.period.to === to;
  const dailyChart = (forecastCurrent ? data?.daily_position ?? [] : []).map((d) => ({
    date: d.date.slice(5),
    In: d.cash_in_cents / 100,
    Out: d.cash_out_cents / 100,
    Net: d.net_cents / 100,
  }));

  const monthlyChart = (forecastCurrent ? data?.monthly_position ?? [] : []).map((m) => ({
    month: m.month,
    In: m.cash_in_cents / 100,
    Out: m.cash_out_cents / 100,
  }));

  const refreshAll = () => {
    refetch();
    refetchReconciliation();
    refetchObligations();
  };

  return (
    <div className="mx-auto min-w-0 max-w-7xl space-y-5 p-4 md:p-6">
      <header className="space-y-5 border-b border-slate-200 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h1 className="text-3xl font-bold tracking-tight text-slate-950">Cash flow</h1></div>
          <Link href="/office/financial-dashboard" className="text-sm font-medium text-blue-600 hover:underline">Executive dashboard →</Link>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1 text-xs font-medium text-slate-500 sm:flex-none">From<input aria-label="From date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900" /></label>
          <label className="min-w-0 flex-1 text-xs font-medium text-slate-500 sm:flex-none">To<input aria-label="To date" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900" /></label>
          <button onClick={refreshAll} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"><RefreshCw className="h-4 w-4" />Refresh</button>
        </div>
      </header>

      {!periodValid ? <p role="alert" className="text-sm text-red-600">Choose a valid date range with the start on or before the end.</p> : error ? <p role="alert" className="text-sm text-red-600">Period data unavailable. {error}</p> : null}

      {reconciliation?.synthetic ? <CashFlowDetails title="Demo settings"><label className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">Demo scenario
        <select aria-label="Synthetic test scenario" value={scenario} onChange={e => setScenario(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          <option value="differences">Unresolved differences</option><option value="equal">Balances agree</option><option value="stale">Stale feed</option><option value="missing">Missing bank balance</option>
        </select>
      </label><p>Demo bank balances and the staging ledger use separate datasets.</p></CashFlowDetails> : null}
      <CashReconciliationPanel data={reconciliation} loading={reconciliationLoading} error={reconciliationError} />

      <section aria-label="Selected-period cash flow" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold tracking-tight text-slate-900">Selected period</h2><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800">Provisional</span></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FinanceKpiCard icon={ArrowUpRight} label="Paystack receipts · gross" value={!forecastCurrent ? "Unavailable" : data?.payment_evidence.verified_transaction_count ? formatZar(s?.money_received_cents ?? 0) : "Unverified"} loading={loading} status="positive" />
        <FinanceKpiCard icon={ArrowUpRight} label="Paystack bank deposits" value={!forecastCurrent ? "Unavailable" : formatZar(s?.money_received_net_cents ?? 0)} loading={loading} status="positive" />
        <FinanceKpiCard icon={ArrowDownLeft} label="Paystack fees" value={!forecastCurrent ? "Unavailable" : data?.payment_evidence.fees_verified ? formatZar(s?.gateway_processing_fees_cents ?? 0) : "Unverified"} loading={loading} status="warning" />
        <FinanceKpiCard icon={ArrowDownLeft} label="Payouts + approved expenses" value={!forecastCurrent ? "Unavailable" : formatZar(s?.money_paid_cents ?? 0)} loading={loading} status="negative" />
      </div>
      <p className="text-xs text-slate-500">Approved expenses may not yet be paid.</p>
      <CashFlowDetails title="Balances & obligations">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <FinanceKpiCard icon={Banknote} label="Local bank ledger · unverified" value={!forecastCurrent ? "Unavailable" : formatZar(s?.cash_in_bank_cents ?? 0)} loading={loading} />
        <FinanceKpiCard icon={PiggyBank} label="Petty cash" value={!forecastCurrent ? "Unavailable" : formatZar(s?.petty_cash_cents ?? 0)} loading={loading} />
        <FinanceKpiCard icon={TrendingUp} label="Expected income · selected period" value={!forecastCurrent ? "Unavailable" : formatForecastZar(s?.expected_income_cents ?? 0)} loading={loading} status="positive" />
        <FinanceKpiCard icon={Wallet} label="Expected expenses · selected period" value={!forecastCurrent ? "Unavailable" : formatForecastZar(s?.expected_expenses_cents ?? 0)} loading={loading} status="warning" />
        <FinanceKpiCard
          icon={TrendingUp}
          label="Provisional net · settlements less payouts/approved expenses"
          value={!forecastCurrent ? "Unavailable" : formatZar(s?.net_cash_flow_cents ?? 0)}
          loading={loading}
          status={(s?.net_cash_flow_cents ?? 0) >= 0 ? "positive" : "negative"}
        />
      </div>
      <section aria-label="Local obligations and receivables" className="space-y-3 text-sm">
        <h2 className="font-semibold">Local obligations · provisional</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <p>Unpaid cleaner earnings<strong className="block">{obligationAmount(obligations?.obligations.cleaner_unpaid_liability_cents)}</strong></p>
          <p>Minimum operating reserve<strong className="block">{obligationAmount(obligations?.obligations.minimum_operating_reserve_cents)}</strong></p>
          <p>Collectible monthly invoices<strong className="block">{obligationAmount(obligations?.receivables.sent_collectible_cents)}</strong></p>
          <p>Draft monthly forecast<strong className="block">{obligationAmount(obligations?.receivables.draft_monthly_cents)}</strong></p>
        </div>
        <p className="mt-3 text-slate-600">Local totals are incomplete and do not establish spendable cash.</p>
      </section>
      </CashFlowDetails>
      </section>

      <CashFlowDetails title="How totals are calculated">
        <p className="text-xs text-slate-600" role="note">Provisional net uses recorded Paystack settlements less cleaner batches marked paid and locally approved expenses. Approved expenses are included by expense date; approval and a selected payment method do not verify a matched bank debit. Bank-verified expense cash outflow is not available from this source. Expected income and expected expenses are a separate, incomplete forecast; they are not used in this provisional-net figure. Provisional net is not a reconciled all-bank cash movement total.</p>
        {forecastCurrent && data?.payment_evidence ? <section aria-label="Payment evidence" className="space-y-2">
          <p>Paystack receipts and reported fees use payment dates in South African time for {from} to {to}. Booking values, service dates, EFT and cash are excluded.</p>
          <p>Recorded transactions: {data.payment_evidence.transaction_count} · Unverified payments: {data.payment_evidence.unverified_payment_count} · Missing provider fees: {data.payment_evidence.unverified_fee_count}</p>
          {!data.payment_evidence.fees_verified ? <p className="font-medium text-amber-800">Fees are unverified, not zero.</p> : null}
          <p>Recorded subtotals may be incomplete. Settled-to-bank cash is separate from gross receipts and is never inferred by subtracting fees.</p>
          <Link href="/office/payment-reconciliation" className="inline-block font-medium text-blue-600 hover:underline">Review payment reconciliation →</Link>
        </section> : null}
      </CashFlowDetails>

      {forecastCurrent && data?.forecast ? <CashFlowForecastBreakdown forecast={data.forecast} from={data.period.from} to={data.period.to} /> : null}

      <CashFlowDetails title="Activity charts">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 aria-label="Recorded inflows vs provisional outflows (monthly)" className="mb-4 text-sm font-semibold text-slate-800">Monthly recorded activity</h2>
          <div className={forecastCurrent && monthlyChart.length > 0 ? "h-64" : "flex min-h-24 items-center justify-center rounded-lg bg-slate-50 p-4 text-center"}>
            {!forecastCurrent ? <p role="status" className="text-sm text-slate-600">{loading && periodValid ? "Loading selected-period data…" : "Selected-period data unavailable."}</p> : monthlyChart.length === 0 ? <p className="text-sm text-slate-600">No recorded activity.</p> : <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `R${v}`} />
                <Tooltip formatter={(v: number) => `R ${v.toLocaleString("en-ZA")}`} />
                <Legend />
                <Bar dataKey="In" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Out" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 aria-label="Daily provisional net cash flow" className="mb-4 text-sm font-semibold text-slate-800">Daily provisional net</h2>
          <div className={forecastCurrent && dailyChart.length > 0 ? "h-64" : "flex min-h-24 items-center justify-center rounded-lg bg-slate-50 p-4 text-center"}>
            {!forecastCurrent ? <p role="status" className="text-sm text-slate-600">{loading && periodValid ? "Loading selected-period data…" : "Selected-period data unavailable."}</p> : dailyChart.length === 0 ? <p className="text-sm text-slate-600">No recorded activity.</p> : <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `R${v}`} />
                <Tooltip formatter={(v: number) => `R ${v.toLocaleString("en-ZA")}`} />
                <Line type="monotone" dataKey="Net" stroke="#408df7" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>}
          </div>
        </section>
      </div>
      </CashFlowDetails>
    </div>
  );
}

