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
import { useAdminData } from "@/hooks/useAdminData";
import type { CashFlowDashboardPayload } from "@/lib/admin/expenses/loadCashFlowDashboard";
import { defaultOfficePayoutPeriodRange } from "@/lib/admin/payouts/officePayoutPeriodReport";

function formatZar(cents: number): string {
  return `R ${Math.round(cents / 100).toLocaleString("en-ZA")}`;
}

export default function CashFlowPage() {
  const defaults = defaultOfficePayoutPeriodRange();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const params = useMemo(() => ({ from, to }), [from, to]);

  const { data, loading, error, refetch } = useAdminData<CashFlowDashboardPayload>("/api/admin/cash-flow", {
    params,
  });

  const s = data?.summary;
  const dailyChart = (data?.daily_position ?? []).map((d) => ({
    date: d.date.slice(5),
    In: d.cash_in_cents / 100,
    Out: d.cash_out_cents / 100,
    Net: d.net_cents / 100,
  }));

  const monthlyChart = (data?.monthly_position ?? []).map((m) => ({
    month: m.month,
    In: m.cash_in_cents / 100,
    Out: m.cash_out_cents / 100,
  }));

  return (
    <div className="space-y-6 p-4 md:p-6">
      <OfficeZohoPageHeader
        title="Cash flow"
        subtitle="Money in, money out, and cash position"
        live
        actions={
          <>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
            <OfficeZohoSecondaryButton onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </OfficeZohoSecondaryButton>
            <Link href="/office/financial-dashboard" className="text-sm font-medium text-[#408df7] hover:underline">
              Executive dashboard →
            </Link>
          </>
        }
      />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-wrap gap-3">
        <FinanceKpiCard icon={ArrowUpRight} label="Money received (gross)" value={formatZar(s?.money_received_cents ?? 0)} loading={loading} status="positive" />
        <FinanceKpiCard icon={ArrowUpRight} label="Net received" value={formatZar(s?.money_received_net_cents ?? 0)} loading={loading} status="positive" />
        <FinanceKpiCard icon={ArrowDownLeft} label="Gateway fees" value={formatZar(s?.gateway_processing_fees_cents ?? 0)} loading={loading} status="warning" />
        <FinanceKpiCard icon={ArrowDownLeft} label="Money paid" value={formatZar(s?.money_paid_cents ?? 0)} loading={loading} status="negative" />
        <FinanceKpiCard icon={Banknote} label="Cash in bank" value={formatZar(s?.cash_in_bank_cents ?? 0)} loading={loading} />
        <FinanceKpiCard icon={PiggyBank} label="Petty cash" value={formatZar(s?.petty_cash_cents ?? 0)} loading={loading} />
        <FinanceKpiCard icon={TrendingUp} label="Expected income" value={formatZar(s?.expected_income_cents ?? 0)} loading={loading} status="positive" />
        <FinanceKpiCard icon={Wallet} label="Expected expenses" value={formatZar(s?.expected_expenses_cents ?? 0)} loading={loading} status="warning" />
        <FinanceKpiCard
          icon={TrendingUp}
          label="Net cash flow"
          value={formatZar(s?.net_cash_flow_cents ?? 0)}
          loading={loading}
          status={(s?.net_cash_flow_cents ?? 0) >= 0 ? "positive" : "negative"}
        />
        <FinanceKpiCard
          icon={Banknote}
          label="Cash runway"
          value={s?.cash_runway_days != null ? `${s.cash_runway_days} days` : "—"}
          loading={loading}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Cash in vs cash out (monthly)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `R${v}`} />
                <Tooltip formatter={(v: number) => `R ${v.toLocaleString("en-ZA")}`} />
                <Legend />
                <Bar dataKey="In" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Out" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Daily net cash flow</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `R${v}`} />
                <Tooltip formatter={(v: number) => `R ${v.toLocaleString("en-ZA")}`} />
                <Line type="monotone" dataKey="Net" stroke="#408df7" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}
