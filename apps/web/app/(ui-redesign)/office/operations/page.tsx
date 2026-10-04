"use client";

import Link from "next/link";
import { Activity, AlertTriangle, Users, Calendar, RefreshCw, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminData } from "@/hooks/useAdminData";
import type { OfficeOperationsSummary } from "@/lib/admin/officeOperations";
import {
  OfficeZohoPageHeader,
  OfficeZohoSecondaryButton,
} from "@/components/admin/office/OfficeZohoChrome";

const PRIORITY_MAP: Record<string, { cls: string; label: string }> = {
  critical: { cls: "bg-red-100 text-red-700", label: "Critical" },
  high: { cls: "bg-orange-100 text-orange-700", label: "High" },
  medium: { cls: "bg-yellow-100 text-yellow-700", label: "Medium" },
  low: { cls: "bg-slate-100 text-slate-600", label: "Low" },
};

export default function OperationsPage() {
  const { data, loading, error, refetch } = useAdminData<OfficeOperationsSummary>("/api/admin/office-operations");

  const kpis = data?.kpis;
  const issues = data?.issues ?? [];
  const supplyDemand = data?.supplyDemand ?? [];

  return (
    <div className="space-y-5">
      <OfficeZohoPageHeader
        title="Operations"
        subtitle="Daily operational control center — live bookings, issues and supply."
        actions={
          <OfficeZohoSecondaryButton onClick={() => void refetch()} className="px-3 py-2">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Refresh
          </OfficeZohoSecondaryButton>
        }
      />

      {error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Bookings today", value: kpis?.bookingsToday ?? "—", sub: "Scheduled for today", icon: Calendar, color: "bg-blue-50 text-blue-600" },
          { label: "Open issues", value: kpis?.openIssues ?? "—", sub: "Dispatch + health alerts", icon: AlertTriangle, color: "bg-red-50 text-red-600" },
          { label: "Available cleaners", value: kpis?.availableCleaners ?? "—", sub: "Idle + rostered today", icon: Users, color: "bg-emerald-50 text-emerald-600" },
          { label: "Unassigned paid jobs", value: kpis?.unassignedPaid ?? "—", sub: "Paid, no cleaner yet", icon: Activity, color: "bg-violet-50 text-violet-600" },
        ].map((k) => {
          const KIcon = k.icon;
          const [iconBg, iconColor] = k.color.split(" ");
          return (
            <div key={k.label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
                  <p className="mt-1 text-3xl font-bold text-slate-800 tabular-nums">{loading ? "—" : k.value}</p>
                  {"sub" in k && k.sub ? <p className="mt-0.5 text-[11px] text-slate-400">{k.sub}</p> : null}
                </div>
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", iconBg)}>
                  <KIcon className={cn("h-5 w-5", iconColor)} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-bold text-slate-800">Open issues</h3>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : issues.length === 0 ? (
          <p className="text-sm text-emerald-600">No open operational issues detected.</p>
        ) : (
          <div className="space-y-2">
            {issues.map((issue) => {
              const p = PRIORITY_MAP[issue.priority] ?? PRIORITY_MAP.medium!;
              return (
                <div key={issue.id} className="flex items-center gap-3 rounded-xl border border-slate-100 px-4 py-3">
                  <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold", p.cls)}>{p.label}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{issue.title}</p>
                    <p className="text-xs text-slate-400">
                      {issue.assigned} · {issue.ageLabel}
                    </p>
                  </div>
                  {issue.id === "sla-breaches" || issue.id === "unassigned" ? (
                    <Link href="/office/sla-breaches" className="text-xs font-bold text-blue-600 hover:underline">
                      View queue
                    </Link>
                  ) : issue.id.startsWith("health-") ? (
                    <Link href="/office/ops-health" className="text-xs font-bold text-blue-600 hover:underline">
                      Ops health
                    </Link>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h3 className="mb-1 text-sm font-bold text-slate-800">Cleaner supply vs booking demand — next 7 days</h3>
        <p className="mb-4 text-xs text-slate-500">
          Supply = cleaners online, rostered, and idle for that day. Demand = scheduled bookings (excl. cancelled).
        </p>
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="space-y-2">
            {supplyDemand.map((day) => {
              const gap = day.supply - day.demand;
              const max = Math.max(day.supply, day.demand, 1);
              return (
                <div key={day.date} className="flex items-center gap-3">
                  <div className="w-28 shrink-0 text-xs font-medium text-slate-600">{day.label}</div>
                  <div className="flex flex-1 items-center gap-2">
                    <div className="flex flex-1 gap-1">
                      <div
                        title={`Supply: ${day.supply}`}
                        className="h-2 rounded-full bg-emerald-400"
                        style={{ width: `${(day.supply / max) * 50}%` }}
                      />
                      <div
                        title={`Demand: ${day.demand}`}
                        className="h-2 rounded-full bg-blue-400"
                        style={{ width: `${(day.demand / max) * 50}%` }}
                      />
                    </div>
                    <span
                      className={cn(
                        "w-16 text-right text-[11px] font-bold",
                        gap < 0 ? "text-red-600" : gap === 0 ? "text-orange-600" : "text-emerald-600",
                      )}
                    >
                      {gap > 0 ? `+${gap} spare` : gap === 0 ? "Exact" : `${gap} short`}
                    </span>
                  </div>
                </div>
              );
            })}
            <div className="flex items-center gap-3 pt-1">
              <div className="w-28" />
              <div className="flex items-center gap-4 text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-3 rounded bg-emerald-400" /> Supply (idle + rostered)
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-3 rounded bg-blue-400" /> Demand (scheduled bookings)
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400">
        Issues are derived from dispatch SLA snapshot and production health scans.{" "}
        <Link href="/office/schedule" className="text-blue-600 hover:underline">
          Open schedule
        </Link>
      </p>
    </div>
  );
}
