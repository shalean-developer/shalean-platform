"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, DollarSign, RefreshCw, TrendingUp } from "lucide-react";
import {
  OfficeZohoMetricsRow,
  OfficeZohoPageHeader,
  OfficeZohoSecondaryButton,
  OfficeZohoTableShell,
} from "@/components/admin/office/OfficeZohoChrome";
import { FinanceKpiCard } from "@/components/admin/finance/FinanceKpiCard";
import { useAdminData } from "@/hooks/useAdminData";
import type { ReferralFinanceDashboardPayload } from "@/lib/admin/referrals/loadReferralFinanceDashboard";
import { defaultOfficePayoutPeriodRange } from "@/lib/admin/payouts/officePayoutPeriodReport";

function formatZar(cents: number): string {
  return `R ${Math.round(cents / 100).toLocaleString("en-ZA")}`;
}

export default function ReferralFinancePage() {
  const defaults = defaultOfficePayoutPeriodRange();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const params = useMemo(() => ({ from, to }), [from, to]);
  const { data, loading, error, refetch } = useAdminData<ReferralFinanceDashboardPayload>(
    "/api/admin/referral-finance",
    { params },
  );

  const s = data?.summary;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <OfficeZohoPageHeader
        title="Referral finance"
        subtitle="Executive view of referral revenue, costs, ROI, and branch impact"
        live
        actions={
          <>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
            <OfficeZohoSecondaryButton onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </OfficeZohoSecondaryButton>
          </>
        }
      />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {(data?.reconciliation_queue_count ?? 0) > 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {data?.reconciliation_queue_count} booking(s) need referral reconciliation.{" "}
            <Link href="/office/referral-reconciliation" className="font-medium underline">
              Review queue
            </Link>
          </span>
        </div>
      ) : null}

      <OfficeZohoMetricsRow>
        <FinanceKpiCard icon={TrendingUp} label="Referred revenue" value={loading || !s ? "—" : formatZar(s.gross_referred_revenue_cents)} loading={loading} />
        <FinanceKpiCard icon={DollarSign} label="Referral discount cost" value={loading || !s ? "—" : formatZar(s.referral_discount_cost_cents)} loading={loading} />
        <FinanceKpiCard icon={DollarSign} label="Cleaning credit cost" value={loading || !s ? "—" : formatZar(s.cleaning_credit_cost_cents)} loading={loading} />
        <FinanceKpiCard icon={TrendingUp} label="Net contribution" value={loading || !s ? "—" : formatZar(s.estimated_net_contribution_cents)} loading={loading} />
        <FinanceKpiCard icon={TrendingUp} label="Referral ROI" value={loading || !s ? "—" : s.referral_roi_percent != null ? `${s.referral_roi_percent}%` : "—"} loading={loading} />
        <FinanceKpiCard icon={TrendingUp} label="Successful referrals" value={loading || !s ? "—" : String(s.successful_referrals)} loading={loading} />
        <FinanceKpiCard icon={TrendingUp} label="Conversion rate" value={loading || !s ? "—" : s.conversion_rate_percent != null ? `${s.conversion_rate_percent}%` : "—"} loading={loading} />
        <FinanceKpiCard icon={DollarSign} label="Avg referral value" value={loading || !s ? "—" : formatZar(s.avg_referral_value_cents)} loading={loading} />
      </OfficeZohoMetricsRow>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">Monthly referral economics</h2>
        <OfficeZohoTableShell>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Month</th>
              <th className="px-4 py-3 text-right">Revenue</th>
              <th className="px-4 py-3 text-right">Discounts</th>
              <th className="px-4 py-3 text-right">Rewards</th>
              <th className="px-4 py-3 text-right">Net</th>
            </tr>
          </thead>
          <tbody>
            {(data?.monthly_trend ?? []).map((row) => (
              <tr key={row.month} className="border-b border-slate-50">
                <td className="px-4 py-3">{row.month}</td>
                <td className="px-4 py-3 text-right">{formatZar(row.referred_revenue_cents)}</td>
                <td className="px-4 py-3 text-right text-red-600">-{formatZar(row.discount_cost_cents)}</td>
                <td className="px-4 py-3 text-right text-red-600">-{formatZar(row.reward_cost_cents)}</td>
                <td className="px-4 py-3 text-right font-medium">{formatZar(row.net_contribution_cents)}</td>
              </tr>
            ))}
            {!loading && !(data?.monthly_trend?.length) ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No referral economics for this period.</td></tr>
            ) : null}
          </tbody>
        </table>
        </OfficeZohoTableShell>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">Promo cost by branch</h2>
        <OfficeZohoTableShell>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Branch</th>
              <th className="px-4 py-3 text-right">Referral discounts</th>
              <th className="px-4 py-3 text-right">Cleaning credit</th>
              <th className="px-4 py-3 text-right">Total promo cost</th>
            </tr>
          </thead>
          <tbody>
            {(data?.by_branch ?? []).map((row) => (
              <tr key={row.branch_id} className="border-b border-slate-50">
                <td className="px-4 py-3">{row.branch_name}</td>
                <td className="px-4 py-3 text-right">{formatZar(row.referral_discount_cost_cents)}</td>
                <td className="px-4 py-3 text-right">{formatZar(row.cleaning_credit_cost_cents)}</td>
                <td className="px-4 py-3 text-right font-medium">{formatZar(row.total_promo_cost_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </OfficeZohoTableShell>
      </section>
    </div>
  );
}
