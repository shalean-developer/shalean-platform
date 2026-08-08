"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  canAccessOwnerCommandCentre,
  formatOwnerCount,
  formatOwnerPct,
  formatOwnerZar,
  formatOwnerZarFromCents,
  ownerQuickActionsForPermissions,
  type OwnerCommandCentrePayload,
} from "@/lib/admin/ownerCommandCentre";
import { getSupabaseAccessToken } from "@/lib/supabase/browser";

type Props = { permissions: ReadonlySet<string> };

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-xl font-bold tabular-nums ${value === "Not available" ? "text-slate-400" : "text-slate-950"}`}>{value}</p>
    </div>
  );
}

export function OwnerCommandCentrePanel({ permissions }: Props) {
  const [data, setData] = useState<OwnerCommandCentrePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!canAccessOwnerCommandCentre(permissions)) {
        if (!cancelled) setLoading(false);
        return;
      }
      const token = await getSupabaseAccessToken();
      if (!token) {
        if (!cancelled) {
          setError("Office session unavailable.");
          setLoading(false);
        }
        return;
      }
      try {
        const response = await fetch("/api/admin/owner-command-centre", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as OwnerCommandCentrePayload & { error?: string };
        if (cancelled) return;
        if (!response.ok) setError(payload.error || "Could not load owner KPIs.");
        else setData(payload);
      } catch {
        if (!cancelled) setError("Could not load owner KPIs.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [permissions]);

  if (!canAccessOwnerCommandCentre(permissions)) return null;
  if (loading) return <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Loading Owner Command Centre…</section>;
  if (error || !data) return <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">{error || "Owner Command Centre is unavailable."}</section>;

  const quickActions = ownerQuickActionsForPermissions(permissions);
  return (
    <section className="space-y-4" aria-label="Owner live command centre">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Live owner KPIs</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">Business and control snapshot</h2>
        </div>
        <p className="text-xs text-slate-500">Updated {new Date(data.generatedAt).toLocaleString("en-ZA")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Revenue today" value={formatOwnerZar(data.businessHealth.revenueTodayZar)} />
        <Metric label="Revenue this month" value={formatOwnerZar(data.businessHealth.revenueMonthZar)} />
        <Metric label="Gross margin" value={formatOwnerZarFromCents(data.businessHealth.grossMarginCents)} />
        <Metric label="Net operating position" value={formatOwnerZarFromCents(data.businessHealth.netOperatingPositionCents)} />
        <Metric label="Bookings today" value={formatOwnerCount(data.todaySnapshot.totalBookings)} />
        <Metric label="Completed today" value={formatOwnerCount(data.todaySnapshot.completed)} />
        <Metric label="Cleaner liabilities" value={formatOwnerZarFromCents(data.cashFlow.cleanerLiabilitiesCents)} />
        <Metric label="Pending payout approvals" value={formatOwnerZarFromCents(data.payoutApprovals.pendingApprovalAmountCents)} />
        <Metric label="Cash position" value={formatOwnerZarFromCents(data.cashFlow.netCashPositionCents)} />
        <Metric label="Outstanding customer payments" value={formatOwnerZarFromCents(data.cashFlow.outstandingCustomerPaymentsCents)} />
        <Metric label="Recent permission changes" value={formatOwnerCount(data.security.recentPermissionChanges)} />
        <Metric label="Month comparison" value={formatOwnerPct(data.businessHealth.previousMonthComparisonPct)} />
      </div>

      {quickActions.length ? (
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action) => (
            <Link key={action.id} href={action.href} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700">
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
