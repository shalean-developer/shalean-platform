"use client";

import Link from "next/link";
import { AlertTriangle, RefreshCw, ShieldAlert } from "lucide-react";
import {
  OfficeZohoMetricsRow,
  OfficeZohoPageHeader,
  OfficeZohoSecondaryButton,
  OfficeZohoTableShell,
} from "@/components/admin/office/OfficeZohoChrome";
import { FinanceKpiCard } from "@/components/admin/finance/FinanceKpiCard";
import { useAdminData } from "@/hooks/useAdminData";
import type { ReferralFraudDashboardPayload } from "@/lib/admin/referrals/loadReferralFraudDashboard";
import { cn } from "@/lib/utils";

function riskBadge(level: string): string {
  switch (level) {
    case "critical":
      return "bg-red-100 text-red-800";
    case "high":
      return "bg-orange-100 text-orange-800";
    case "medium":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export default function ReferralFraudPage() {
  const { data, loading, error, refetch } = useAdminData<ReferralFraudDashboardPayload>(
    "/api/admin/referrals/fraud",
  );

  const s = data?.summary;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <OfficeZohoPageHeader
        title="Referral fraud monitoring"
        subtitle="Spike detection, device fingerprint abuse, and referrer risk scores"
        live
        actions={
          <OfficeZohoSecondaryButton onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </OfficeZohoSecondaryButton>
        }
      />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {(s?.reconciliationQueueCount ?? 0) > 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {s?.reconciliationQueueCount} booking(s) in the{" "}
            <Link href="/office/referral-reconciliation" className="font-medium underline">
              reconciliation queue
            </Link>
            .
          </span>
        </div>
      ) : null}

      <OfficeZohoMetricsRow>
        <FinanceKpiCard
          icon={ShieldAlert}
          label="High / critical risk referrers"
          value={loading || !s ? "—" : String(s.highOrCriticalCount)}
          loading={loading}
          status={s && s.highOrCriticalCount > 0 ? "warning" : "neutral"}
        />
        <FinanceKpiCard
          icon={AlertTriangle}
          label="Redemption spikes"
          value={loading || !s ? "—" : String(s.spikeFlagCount)}
          loading={loading}
        />
        <FinanceKpiCard
          icon={ShieldAlert}
          label="Duplicate device alerts"
          value={loading || !s ? "—" : String(s.duplicateFingerprintCount)}
          loading={loading}
        />
      </OfficeZohoMetricsRow>

      <OfficeZohoTableShell>
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">Flagged referrers</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Referrer</th>
              <th className="px-4 py-3">Risk</th>
              <th className="px-4 py-3 text-right">Score</th>
              <th className="px-4 py-3 text-right">Month redemptions</th>
              <th className="px-4 py-3 text-right">Net contribution</th>
              <th className="px-4 py-3">Signals</th>
            </tr>
          </thead>
          <tbody>
            {(data?.referrers ?? []).map((row) => (
              <tr key={`${row.referrerType}:${row.referrerId}`} className="border-b border-slate-50 align-top">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{row.displayLabel}</div>
                  <div className="text-xs text-slate-500">{row.referrerType}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium capitalize", riskBadge(row.riskLevel))}>
                    {row.riskLevel}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono">{row.fraudScore}</td>
                <td className="px-4 py-3 text-right">{row.currentMonthRedemptions}</td>
                <td className="px-4 py-3 text-right">
                  {row.estimatedNetContributionZar != null
                    ? `R ${row.estimatedNetContributionZar.toLocaleString("en-ZA")}`
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <ul className="list-inside list-disc text-xs text-slate-600">
                    {row.signals.map((sig) => (
                      <li key={sig.code}>{sig.label}</li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
            {!loading && !(data?.referrers?.length) ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                  No elevated-risk referrers detected.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </OfficeZohoTableShell>

      <OfficeZohoTableShell>
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">Duplicate device fingerprints (30 days)</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Referral code</th>
              <th className="px-4 py-3">Fingerprint</th>
              <th className="px-4 py-3 text-right">Identities</th>
              <th className="px-4 py-3 text-right">Redemptions</th>
            </tr>
          </thead>
          <tbody>
            {(data?.duplicateFingerprints ?? []).map((row) => (
              <tr key={`${row.referralCode}:${row.checkoutFingerprint}`} className="border-b border-slate-50">
                <td className="px-4 py-3 font-mono text-xs">{row.referralCode}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.checkoutFingerprint.slice(0, 16)}…</td>
                <td className="px-4 py-3 text-right">{row.distinctIdentities}</td>
                <td className="px-4 py-3 text-right">{row.redemptionCount}</td>
              </tr>
            ))}
            {!loading && !(data?.duplicateFingerprints?.length) ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-slate-500">
                  No duplicate device patterns detected.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </OfficeZohoTableShell>
    </div>
  );
}
