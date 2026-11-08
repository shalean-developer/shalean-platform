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
import {
  OfficeZohoPageHeader,
  OfficeZohoSecondaryButton,
} from "@/components/admin/office/OfficeZohoChrome";
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
    <div className="min-w-0 space-y-6 p-4 md:p-6">
      <OfficeZohoPageHeader
        title="Cash flow"
        subtitle="Money in, money out, and cash position"
        actions={
          <>
            <input aria-label="From date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
            <input aria-label="To date" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
            <OfficeZohoSecondaryButton onClick={refreshAll}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </OfficeZohoSecondaryButton>
            <Link href="/office/financial-dashboard" className="text-sm font-medium text-[#408df7] hover:underline">
              Executive dashboard →
            </Link>
          </>
        }
      />

      {!periodValid ? <p role="alert" className="text-sm text-red-600">Choose a valid date range with the start on or before the end.</p> : error ? <p role="alert" className="text-sm text-red-600">Period data unavailable. {error}</p> : null}

      {reconciliation?.synthetic ? <label className="block text-sm font-medium">Synthetic test scenario
        <select aria-label="Synthetic test scenario" value={scenario} onChange={e => setScenario(e.target.value)} className="ml-3 rounded-md border p-2">
          <option value="differences">Unresolved differences</option><option value="equal">Balances agree</option><option value="stale">Stale feed</option><option value="missing">Missing bank balance</option>
        </select>
      </label> : null}
      {reconciliation?.synthetic ? <p className="text-sm text-slate-600">The fictional account demonstration and the local staging ledger below are separate datasets. Their totals are not expected to match.</p> : null}
      <CashReconciliationPanel data={reconciliation} loading={reconciliationLoading} error={reconciliationError} />

      <section aria-label="Local obligations and receivables" className="rounded-xl border bg-white p-5 text-sm">
        <h2 className="font-semibold">Local obligations and receivables · provisional</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <p>Unpaid cleaner earnings<strong className="block">{obligationAmount(obligations?.obligations.cleaner_unpaid_liability_cents)}</strong></p>
          <p>Minimum operating reserve<strong className="block">{obligationAmount(obligations?.obligations.minimum_operating_reserve_cents)}</strong></p>
          <p>Collectible monthly invoices<strong className="block">{obligationAmount(obligations?.receivables.sent_collectible_cents)}</strong></p>
          <p>Draft monthly forecast<strong className="block">{obligationAmount(obligations?.receivables.draft_monthly_cents)}</strong></p>
        </div>
        <p className="mt-3 text-slate-600">These local period totals are not reconciled to all Zoho obligations. They do not establish free cash; customer advances and Bokkie funds remain separately unresolved.</p>
      </section>
      <div className="flex flex-wrap gap-3">
        <FinanceKpiCard icon={ArrowUpRight} label="Recorded Paystack receipts · gross" value={!forecastCurrent ? "Unavailable" : data?.payment_evidence.verified_transaction_count ? formatZar(s?.money_received_cents ?? 0) : "Unverified"} loading={loading} status="positive" />
        <FinanceKpiCard icon={ArrowUpRight} label="Paystack settled to bank" value={!forecastCurrent ? "Unavailable" : formatZar(s?.money_received_net_cents ?? 0)} loading={loading} status="positive" />
        <FinanceKpiCard icon={ArrowDownLeft} label="Paystack fees · reported" value={!forecastCurrent ? "Unavailable" : data?.payment_evidence.fees_verified ? formatZar(s?.gateway_processing_fees_cents ?? 0) : "Unverified"} loading={loading} status="warning" />
        <FinanceKpiCard icon={ArrowDownLeft} label="Paid cleaner batches + approved expenses" value={!forecastCurrent ? "Unavailable" : formatZar(s?.money_paid_cents ?? 0)} loading={loading} status="negative" />
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
        <FinanceKpiCard
          icon={Banknote}
          label="Cash runway · reconciliation required"
          value="Unavailable"
          loading={loading}
        />
      </div>

      <p className="text-xs text-slate-600" role="note">Provisional net uses recorded Paystack settlements less cleaner batches marked paid and locally approved expenses. Approved expenses are included by expense date; approval and a selected payment method do not verify a matched bank debit. Bank-verified expense cash outflow is not available from this source. Expected income and expected expenses are a separate, incomplete forecast; they are not used in this provisional-net figure. Provisional net is not a reconciled all-bank cash movement total.</p>

      {forecastCurrent && data?.payment_evidence ? (
        <section aria-label="Payment evidence" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-slate-800">
          <p>Paystack receipts and reported fees use payment dates in South African time for {from} to {to}. Booking values and service dates are excluded. EFT, cash and other payment methods are outside these Paystack cards.</p>
          <p className="mt-2">Recorded transactions: {data.payment_evidence.transaction_count}. Unverified payments: {data.payment_evidence.unverified_payment_count}. Payments without provider-reported fees: {data.payment_evidence.unverified_fee_count}.</p>
          {!data.payment_evidence.fees_verified ? <p className="mt-2 font-medium">Fees are unverified, not zero. Missing or estimated payment evidence must be reconciled with Paystack.</p> : null}
          <p className="mt-2">These are recorded subtotals, not confirmation that every Paystack payment has been imported. Settled-to-bank cash is separate from gross receipts and is never inferred by subtracting fees.</p>
          <Link href="/office/payment-reconciliation" className="mt-2 inline-block text-blue-700 underline">Review payment reconciliation</Link>
        </section>
      ) : null}

      {forecastCurrent && data?.forecast ? <CashFlowForecastBreakdown forecast={data.forecast} from={data.period.from} to={data.period.to} /> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Recorded inflows vs provisional outflows (monthly)</h2>
          <div className="h-64">
            {!forecastCurrent ? <p role="status" className="text-sm text-slate-600">{loading && periodValid ? "Loading selected-period data…" : "Selected-period data unavailable."}</p> : monthlyChart.length === 0 ? <p className="text-sm text-slate-600">No recorded inflows or provisional outflows in this period.</p> : <ResponsiveContainer width="100%" height="100%">
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

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Daily provisional net cash flow</h2>
          <div className="h-64">
            {!forecastCurrent ? <p role="status" className="text-sm text-slate-600">{loading && periodValid ? "Loading selected-period data…" : "Selected-period data unavailable."}</p> : dailyChart.length === 0 ? <p className="text-sm text-slate-600">No recorded daily cash-flow entries in this period.</p> : <ResponsiveContainer width="100%" height="100%">
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
    </div>
  );
}
