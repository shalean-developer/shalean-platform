"use client";

import { useState } from "react";
import { Activity, CheckCircle2, AlertTriangle, XCircle, RefreshCw, ChevronRight, Clock, Globe, CreditCard, Database, Bell, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

type ServiceStatus = "operational" | "degraded" | "down" | "maintenance";

const STATUS_CONFIG: Record<ServiceStatus, { label: string; dot: string; cls: string; bg: string }> = {
  operational:  { label: "Operational",  dot: "bg-emerald-500", cls: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  degraded:     { label: "Degraded",     dot: "bg-orange-500",  cls: "text-orange-700",  bg: "bg-orange-50 border-orange-200" },
  down:         { label: "Down",         dot: "bg-red-500",     cls: "text-red-700",     bg: "bg-red-50 border-red-200" },
  maintenance:  { label: "Maintenance",  dot: "bg-blue-500",    cls: "text-blue-700",    bg: "bg-blue-50 border-blue-200" },
};

const SERVICES = [
  { name: "Website", description: "Customer-facing booking site", icon: Globe, status: "operational" as ServiceStatus, uptime: "99.98%", latency: "142ms", lastChecked: "Just now" },
  { name: "Booking engine", description: "Core booking flow and availability", icon: Zap, status: "operational" as ServiceStatus, uptime: "99.95%", latency: "210ms", lastChecked: "1m ago" },
  { name: "Payment gateway", description: "Paystack integration", icon: CreditCard, status: "operational" as ServiceStatus, uptime: "99.99%", latency: "320ms", lastChecked: "2m ago" },
  { name: "Supabase (DB)", description: "Primary database and auth", icon: Database, status: "operational" as ServiceStatus, uptime: "100%", latency: "18ms", lastChecked: "30s ago" },
  { name: "Notification service", description: "Email, SMS & WhatsApp delivery", icon: Bell, status: "operational" as ServiceStatus, uptime: "99.81%", latency: "450ms", lastChecked: "3m ago" },
];

export default function OpsHealthPage() {
  const [refreshing, setRefreshing] = useState(false);

  const allOk = SERVICES.every(s => s.status === "operational");

  function handleRefresh() {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1500);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ops Health</h1>
          <p className="mt-0.5 text-sm text-slate-500">Monitor operational system health and service status in real time.</p>
        </div>
        <button type="button" onClick={handleRefresh}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 shadow-sm">
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} /> Refresh all
        </button>
      </div>

      {/* Overall status banner */}
      <div className={cn("flex items-center gap-3 rounded-2xl border p-4",
        allOk ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200")}>
        {allOk
          ? <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
          : <AlertTriangle className="h-6 w-6 text-red-600 shrink-0" />}
        <div>
          <p className={cn("text-sm font-bold", allOk ? "text-emerald-800" : "text-red-800")}>
            {allOk ? "All systems operational" : "System degradation detected"}
          </p>
          <p className={cn("text-xs", allOk ? "text-emerald-600" : "text-red-600")}>
            {allOk ? "All services are running normally." : "One or more services require attention."}
          </p>
        </div>
        <div className="ml-auto text-xs text-slate-400 flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" /> Last updated: just now
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Services monitored", value: SERVICES.length, color: "text-slate-800" },
          { label: "Operational", value: SERVICES.filter(s => s.status === "operational").length, color: "text-emerald-600" },
          { label: "Degraded", value: SERVICES.filter(s => s.status === "degraded").length, color: "text-orange-600" },
          { label: "Avg uptime", value: "99.95%", color: "text-blue-600" },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
            <p className={cn("mt-1 text-2xl font-bold", k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Service list */}
      <div className="space-y-3">
        {SERVICES.map((s) => {
          const cfg = STATUS_CONFIG[s.status];
          const SIcon = s.icon;
          return (
            <div key={s.name} className={cn("rounded-2xl border p-4 shadow-sm", cfg.bg)}>
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                  <SIcon className="h-5 w-5 text-slate-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-slate-800">{s.name}</p>
                    <span className={cn("flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                      cfg.bg, cfg.cls)}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
                      {cfg.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{s.description}</p>
                </div>
                <div className="hidden sm:flex items-center gap-6 text-center shrink-0">
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Uptime</p>
                    <p className="text-sm font-bold text-slate-700">{s.uptime}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Latency</p>
                    <p className="text-sm font-bold text-slate-700">{s.latency}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Checked</p>
                    <p className="text-sm font-bold text-slate-700">{s.lastChecked}</p>
                  </div>
                </div>
                <button type="button" className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 transition-colors">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Uptime bar */}
              <div className="mt-3 flex items-center gap-2">
                <div className="flex flex-1 gap-0.5">
                  {Array.from({ length: 30 }).map((_, i) => (
                    <div key={i} className={cn("h-2 flex-1 rounded-sm",
                      s.status === "operational" || i < 28 ? "bg-emerald-400" : i < 29 ? "bg-orange-400" : "bg-emerald-400"
                    )} />
                  ))}
                </div>
                <span className="text-[10px] text-slate-400">30d</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
