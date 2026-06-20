"use client";

import { useCallback, useRef } from "react";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Clock,
  Globe,
  CreditCard,
  Database,
  Bell,
  Zap,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OpsHealthFullPanel } from "@/components/admin/OpsHealthFullPanel";
import { useAdminData } from "@/hooks/useAdminData";
import {
  OFFICE_OPS_SERVICE_ICONS,
  OFFICE_OPS_STATUS_CONFIG,
  OFFICE_OPS_UPTIME_BAR_CLASS,
  type OfficeOpsHealthSummary,
  type OfficeOpsServiceCard,
  type OfficeOpsServiceId,
  type OfficeOpsServiceStatus,
} from "@/lib/admin/officeOpsHealth";

const SERVICE_ICON_MAP = {
  globe: Globe,
  zap: Zap,
  "credit-card": CreditCard,
  database: Database,
  bell: Bell,
} as const;

function ServiceIcon({ service }: { service: OfficeOpsServiceCard }) {
  const key = OFFICE_OPS_SERVICE_ICONS[service.id as OfficeOpsServiceId];
  const Icon = SERVICE_ICON_MAP[key as keyof typeof SERVICE_ICON_MAP] ?? Activity;
  return <Icon className="h-5 w-5 text-slate-600" />;
}

function StatusPill({ label, status }: { label: string; status: OfficeOpsServiceStatus }) {
  const cfg = OFFICE_OPS_STATUS_CONFIG[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold", cfg.cls)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
      {label}: {cfg.label}
    </span>
  );
}

export default function OpsHealthPage() {
  const { data, loading, error, refetch } = useAdminData<OfficeOpsHealthSummary>("/api/admin/office-ops-health");
  const serviceRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const scrollToService = useCallback((serviceId: string) => {
    const node = serviceRefs.current[serviceId];
    if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const unifiedHealthy = data?.unified.status === "healthy";
  const allOkNow = unifiedHealthy && (data?.allOperationalNow ?? false);
  const allOk30d = unifiedHealthy && data?.overallPeriodStatus === "operational";
  const issueBreakdown = data?.unified.issueBreakdown;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ops Health</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Live service status from production scans, cron runs, system logs, and notification delivery.
          </p>
          {issueBreakdown && (data?.kpis.issuesNow ?? 0) > 0 ? (
            <p className="mt-2 text-xs font-semibold text-slate-600">
              Issue breakdown: {issueBreakdown.high} High · {issueBreakdown.medium} Medium · {issueBreakdown.low} Low
              {issueBreakdown.critical > 0 ? ` · ${issueBreakdown.critical} Critical` : ""}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh all
        </button>
      </div>

      {error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={() => void refetch()} className="ml-auto text-xs font-semibold text-red-600 hover:underline">
            Retry
          </button>
        </div>
      ) : null}

      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl border p-4",
          allOkNow && allOk30d
            ? "border-emerald-200 bg-emerald-50"
            : data?.overallStatus === "down"
              ? "border-red-200 bg-red-50"
              : "border-orange-200 bg-orange-50",
        )}
      >
        {allOkNow && allOk30d ? (
          <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
        ) : data?.overallStatus === "down" ? (
          <XCircle className="h-6 w-6 shrink-0 text-red-600" />
        ) : (
          <AlertTriangle className="h-6 w-6 shrink-0 text-orange-600" />
        )}
        <div>
          <p
            className={cn(
              "text-sm font-bold",
              allOkNow && allOk30d ? "text-emerald-800" : data?.overallStatus === "down" ? "text-red-800" : "text-orange-800",
            )}
          >
            {          allOkNow && allOk30d
            ? "All systems operational"
            : data?.unified.status === "down" || data?.unified.status === "critical"
              ? "Critical production issues detected"
              : !allOkNow && !allOk30d
                ? "Current and 30-day issues detected"
                : !allOkNow
                  ? "Issues detected right now"
                  : "Historical issues in the last 30 days"}
          </p>
          <p className={cn("text-xs", allOkNow && allOk30d ? "text-emerald-600" : data?.overallStatus === "down" ? "text-red-600" : "text-orange-600")}>
            {data
              ? `Ops health: ${data.unified.status.toUpperCase()} · Now: ${OFFICE_OPS_STATUS_CONFIG[data.overallCurrentStatus].label} · 30d: ${OFFICE_OPS_STATUS_CONFIG[data.overallPeriodStatus].label}`
              : "Checking services…"}
          </p>
          {data && !data.unified.consistencyValid ? (
            <p className="mt-1 text-xs font-medium text-amber-700">Consistency check flagged a mismatch — unified scanner has been reconciled.</p>
          ) : null}
          {data?.error ? <p className="mt-1 text-xs text-slate-600">Scanner note: {data.error}</p> : null}
        </div>
        <div className="ml-auto flex items-center gap-1 text-xs text-slate-500">
          <Clock className="h-3.5 w-3.5" />
          Last updated: {data ? formatChecked(data.fetchedAt) : "—"}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: "Monitored", value: data?.kpis.monitored, color: "text-slate-800" },
          { label: "Healthy now", value: data?.kpis.healthyNow, color: "text-emerald-600" },
          { label: "Issues now", value: data?.kpis.issuesNow, color: (data?.kpis.issuesNow ?? 0) > 0 ? "text-orange-600" : "text-slate-400" },
          { label: "Healthy 30d", value: data?.kpis.healthy30d, color: "text-blue-600" },
          {
            label: "Avg uptime 30d",
            value: data?.kpis.avgUptimePct != null ? `${data.kpis.avgUptimePct}%` : "—",
            color: "text-slate-800",
          },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", k.color)}>{loading && !data ? "—" : k.value ?? "—"}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {(data?.services ?? Array.from({ length: 5 })).map((service, index) => {
          if (!data) {
            return <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-100" />;
          }
          const periodCfg = OFFICE_OPS_STATUS_CONFIG[service.periodStatus];
          const statusMismatch = service.currentStatus !== service.periodStatus;
          return (
            <div
              key={service.id}
              ref={(node) => {
                serviceRefs.current[service.id] = node;
              }}
              className={cn("rounded-2xl border p-4 shadow-sm", periodCfg.bg)}
            >
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                  <ServiceIcon service={service} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-slate-800">{service.name}</p>
                    <StatusPill label="30d" status={service.periodStatus} />
                    <StatusPill label="Now" status={service.currentStatus} />
                  </div>
                  <p className="text-xs text-slate-500">{service.description}</p>
                  <div className="mt-1.5 space-y-0.5">
                    <p className="text-xs text-slate-600">
                      <span className="font-semibold">Now:</span> {service.currentDetail}
                    </p>
                    <p className="text-xs text-slate-600">
                      <span className="font-semibold">30d:</span> {service.periodDetail}
                    </p>
                    {service.currentStatus !== "operational" && service.currentDetail ? (
                      <p className="text-[11px] font-medium text-orange-800">
                        Last failure: {service.currentDetail}
                      </p>
                    ) : null}
                    {statusMismatch ? (
                      <p className="text-[11px] font-medium text-orange-700">Current status differs from 30-day history.</p>
                    ) : null}
                  </div>
                </div>
                <div className="hidden shrink-0 items-center gap-6 text-center sm:flex">
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Uptime 30d</p>
                    <p className="text-sm font-bold text-slate-700">{service.uptimePct != null ? `${service.uptimePct}%` : "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Latency</p>
                    <p className="text-sm font-bold text-slate-700">{service.latencyLabel ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Checked</p>
                    <p className="text-sm font-bold text-slate-700">{service.lastCheckedLabel}</p>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <div className="flex flex-1 gap-0.5">
                  {service.uptimeBars.map((bar, barIndex) => (
                    <div key={`${service.id}-${barIndex}`} className={cn("h-2 flex-1 rounded-sm", OFFICE_OPS_UPTIME_BAR_CLASS[bar])} />
                  ))}
                </div>
                <span className="text-[10px] text-slate-400">30d</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <OpsHealthFullPanel
          initialData={data?.scanner ?? null}
          onRefreshAll={refetch}
          onViewService={scrollToService}
        />
      </div>
    </div>
  );
}

function formatChecked(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
