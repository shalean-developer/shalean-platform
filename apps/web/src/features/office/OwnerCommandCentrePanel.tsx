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

function PrimaryMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  const unavailable = value === "Not available";
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_4px_rgba(15,23,42,0.025)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${unavailable ? "text-slate-400" : "text-slate-950"}`}>{value}</p>
      {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}

function SecondaryMetric({ label, value }: { label: string; value: string }) {
  const unavailable = value === "Not available";
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-3">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <span className={`shrink-0 text-sm font-bold tabular-nums ${unavailable ? "text-slate-400" : "text-slate-950"}`}>{value}</span>
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
    return () => {
      cancelled = true;
    };
  }, [permissions]);

  if (!canAccessOwnerCommandCentre(permissions)) return null;
  if (loading) return <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Loading Owner dashboard…</section>;
  if (error || !data) return <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">{error || "Owner dashboard is unavailable."}</section>;

  const quickActions = ownerQuickActionsForPermissions(permissions).filter((action) =>
    ["create-booking", "assign-teams", "payout-approvals"].includes(action.id),
  );

  return (
    <section className="space-y-4" aria-label="Owner live command centre">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Business today</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">Financial and operating snapshot</h2>
        </div>
        <p className="text-xs text-slate-500">Updated {new Date(data.generatedAt).toLocaleString("en-ZA")}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <PrimaryMetric label="Cash position" value={formatOwnerZarFromCents(data.cashFlow.netCashPositionCents)} detail="Available cash and bank position" />
        <PrimaryMetric label="Revenue this month" value={formatOwnerZar(data.businessHealth.revenueMonthZar)} detail={`${formatOwnerPct(data.businessHealth.previousMonthComparisonPct)} vs previous month-to-date`} />
        <PrimaryMetric label="Net operating position" value={formatOwnerZarFromCents(data.businessHealth.netOperatingPositionCents)} detail={`Gross margin ${formatOwnerZarFromCents(data.businessHealth.grossMarginCents)}`} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SecondaryMetric label="Revenue today" value={formatOwnerZar(data.businessHealth.revenueTodayZar)} />
        <SecondaryMetric label="Bookings today" value={formatOwnerCount(data.todaySnapshot.totalBookings)} />
        <SecondaryMetric label="Completed today" value={formatOwnerCount(data.todaySnapshot.completed)} />
        <SecondaryMetric label="Outstanding payments" value={formatOwnerZarFromCents(data.cashFlow.outstandingCustomerPaymentsCents)} />
        <SecondaryMetric label="Cleaner liabilities" value={formatOwnerZarFromCents(data.cashFlow.cleanerLiabilitiesCents)} />
        <SecondaryMetric label="Payout approvals" value={formatOwnerZarFromCents(data.payoutApprovals.pendingApprovalAmountCents)} />
        <SecondaryMetric label="Operational exceptions" value={formatOwnerCount(data.todaySnapshot.lateOrExceptionCount)} />
        <SecondaryMetric label="Permission changes" value={formatOwnerCount(data.security.recentPermissionChanges)} />
      </div>

      {quickActions.length ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-4">
          <span className="mr-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Quick actions</span>
          {quickActions.map((action) => (
            <Link
              key={action.id}
              href={action.href}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                action.id === "create-booking"
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "border border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700"
              }`}
            >
              {action.id === "create-booking" ? "+ " : ""}{action.label}
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
