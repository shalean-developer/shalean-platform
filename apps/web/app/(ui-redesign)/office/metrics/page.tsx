"use client";

import { useMemo } from "react";
import { Zap, Clock, Users, AlertTriangle, RefreshCw, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminData } from "@/hooks/useAdminData";
import type { DispatchMetricsSnapshot } from "@/lib/admin/metrics";
import type { OpsSnapshot } from "@/lib/admin/opsSnapshot";

function utilizationLabelText(label: "high" | "medium" | "low" | "na"): string {
  if (label === "high") return "Busy";
  if (label === "medium") return "Active";
  if (label === "low") return "Available";
  return "N/A";
}

export default function MetricsPage() {
  const metrics = useAdminData<DispatchMetricsSnapshot>("/api/admin/dispatch-metrics", { params: { window: "7d" } });
  const ops = useAdminData<OpsSnapshot>("/api/admin/ops-snapshot");

  const loading = metrics.loading || ops.loading;
  const error = metrics.error ?? ops.error;

  const p50Min = useMemo(() => {
    const ms = metrics.data?.current.p50LatencyMs;
    return ms != null ? Math.round(ms / 60_000) : null;
  }, [metrics.data]);

  const avgUtil = useMemo(() => {
    const teams = metrics.data?.teams ?? [];
    const withUtil = teams.filter((t) => t.utilization != null);
    if (!withUtil.length) return null;
    return Math.round((withUtil.reduce((s, t) => s + (t.utilization ?? 0), 0) / withUtil.length) * 100);
  }, [metrics.data]);

  const metricCards = [
    {
      label: "Median assignment time",
      value: p50Min != null ? `${p50Min} min` : "—",
      sub: "P50 from dispatch logs (7d)",
      icon: Clock,
      color: "bg-orange-50 text-orange-600",
    },
    {
      label: "Unassigned jobs",
      value: ops.data?.unassigned ?? "—",
      sub: "Paid bookings without cleaner",
      icon: AlertTriangle,
      color: "bg-red-50 text-red-600",
    },
    {
      label: "Cleaner utilisation",
      value: avgUtil != null ? `${avgUtil}%` : "—",
      sub: "Fleet average today",
      icon: Users,
      color: "bg-blue-50 text-blue-600",
    },
    {
      label: "Jobs starting soon",
      value: ops.data?.startingSoon ?? "—",
      sub: ops.data?.startingSoonNextMinutes != null ? `Next in ${ops.data.startingSoonNextMinutes}m` : "Within 2 hours",
      icon: Zap,
      color: "bg-violet-50 text-violet-600",
    },
  ];

  const teams = metrics.data?.teams ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dispatch Metrics</h1>
          <p className="mt-0.5 text-sm text-slate-500">Live dispatch performance, utilisation and team capacity.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            void metrics.refetch();
            void ops.refetch();
          }}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm hover:bg-slate-50"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Refresh
        </button>
      </div>

      {error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((m) => {
          const MIcon = m.icon;
          const [iconBg, iconColor] = m.color.split(" ");
          return (
            <div key={m.label} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{m.label}</p>
                  <p className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">{loading ? "—" : m.value}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{m.sub}</p>
                </div>
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", iconBg)}>
                  <MIcon className={cn("h-5 w-5", iconColor)} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-bold text-slate-800">Assignment success (7d)</h3>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3 text-sm">
            <div>
              <p className="text-xs text-slate-500">Success rate</p>
              <p className="text-xl font-bold text-slate-900">
                {metrics.data?.current.assignmentSuccessRate != null
                  ? `${Math.round(metrics.data.current.assignmentSuccessRate * 1000) / 10}%`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">P95 latency</p>
              <p className="text-xl font-bold text-slate-900">
                {metrics.data?.current.p95LatencyMs != null
                  ? `${Math.round(metrics.data.current.p95LatencyMs / 1000)}s`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">SLA breaches</p>
              <p className="text-xl font-bold text-red-600">{ops.data?.slaBreaches ?? 0}</p>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h3 className="mb-1 text-sm font-bold text-slate-800">Team capacity (today)</h3>
        <p className="mb-4 text-xs text-slate-500">
          Scheduled team jobs for today (Johannesburg), merged with capacity slot usage.
        </p>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : teams.length === 0 ? (
          <p className="text-sm text-slate-500">No team utilisation data.</p>
        ) : (
          <div className="space-y-3">
            {teams.map((t) => {
              const utilPct = t.utilization != null ? Math.round(t.utilization * 100) : 0;
              return (
                <div key={t.teamId} className="flex items-center gap-4">
                  <div className="w-28 shrink-0">
                    <p className="text-sm font-semibold text-slate-800">{t.name}</p>
                    <p className="text-xs text-slate-400">{t.activeMembersToday} members</p>
                  </div>
                  <div className="flex-1">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs text-slate-500">{t.jobsToday} jobs today</span>
                      <span className="text-xs font-bold text-slate-700">{utilPct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div
                        className={cn(
                          "h-2 rounded-full",
                          utilPct >= 90 ? "bg-orange-400" : utilPct >= 60 ? "bg-blue-400" : "bg-emerald-400",
                        )}
                        style={{ width: `${Math.min(100, utilPct)}%` }}
                      />
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold",
                      t.utilizationLabel === "high"
                        ? "bg-orange-100 text-orange-700"
                        : t.utilizationLabel === "medium"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-emerald-100 text-emerald-700",
                    )}
                  >
                    {utilizationLabelText(t.utilizationLabel)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
