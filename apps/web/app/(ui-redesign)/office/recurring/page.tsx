"use client";

import { useState } from "react";
import { Search, Repeat, Pause, PlayCircle, ChevronRight, Calendar, Users, DollarSign, Filter, RefreshCw, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminData, adminFetch } from "@/hooks/useAdminData";

type PlanStatus = "active" | "paused" | "cancelled";

const STATUS_MAP: Record<PlanStatus, { label: string; cls: string }> = {
  active:    { label: "Active",    cls: "bg-emerald-100 text-emerald-700" },
  paused:    { label: "Paused",    cls: "bg-orange-100 text-orange-700" },
  cancelled: { label: "Cancelled", cls: "bg-slate-100 text-slate-600" },
};

const FREQ_LABELS: Record<string, string> = {
  weekly:      "Weekly",
  fortnightly: "Fortnightly",
  biweekly:    "Fortnightly",
  monthly:     "Monthly",
  custom:      "Custom",
};

type RecurringPlan = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  frequency: string;
  status: string;
  next_run_date: string | null;
  price: number;
  service_label: string | null;
};

export default function RecurringPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PlanStatus>("all");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { data, loading, error, refetch } = useAdminData<{ recurring: RecurringPlan[] }>("/api/admin/recurring");
  const plans = data?.recurring ?? [];

  const filtered = plans.filter((p) => {
    const matchSearch = !search ||
      (p.customer_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (p.customer_email ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const activeCount  = plans.filter(p => p.status === "active").length;
  const pausedCount  = plans.filter(p => p.status === "paused").length;
  const cancelledCount = plans.filter(p => p.status === "cancelled").length;
  const monthlyRevenue = plans.filter(p => p.status === "active").reduce((s, p) => s + (p.price ?? 0), 0);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleAction(id: string, action: "pause" | "resume" | "cancel") {
    setActionLoading(id);
    const res = await adminFetch(`/api/admin/recurring/${id}/${action}`, { method: "POST" });
    setActionLoading(null);
    if (res.ok) {
      showToast(`Plan ${action}d`, true);
      void refetch();
    } else {
      showToast((res.error as string | undefined) ?? `Failed to ${action}`, false);
    }
  }

  return (
    <div className="space-y-5">
      {toast && (
        <div className={cn(
          "fixed bottom-6 right-6 z-50 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg",
          toast.ok ? "bg-emerald-600" : "bg-red-600",
        )}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Recurring Plans</h1>
          <p className="mt-0.5 text-sm text-slate-500">Manage customer recurring booking schedules.</p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 shadow-sm"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Active plans",   value: activeCount,                           icon: Repeat,       cls: "bg-emerald-50 text-emerald-700" },
          { label: "Paused",         value: pausedCount,                           icon: Pause,        cls: "bg-orange-50 text-orange-700" },
          { label: "Cancelled",      value: cancelledCount,                        icon: ChevronRight, cls: "bg-slate-50 text-slate-600" },
          { label: "Monthly revenue",value: `R ${monthlyRevenue.toLocaleString("en-ZA")}`, icon: DollarSign,   cls: "bg-violet-50 text-violet-700" },
        ].map(({ label, value, icon: Icon, cls }) => (
          <div key={label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className={cn("mb-2 flex h-9 w-9 items-center justify-center rounded-xl", cls)}>
              <Icon className="h-4 w-4" />
            </div>
            <p className="text-xl font-bold text-slate-900 tabular-nums">{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search customers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div className="flex items-center gap-1">
          {(["all", "active", "paused", "cancelled"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                statusFilter === s
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
              )}
            >
              {s === "all" ? "All" : STATUS_MAP[s as PlanStatus]?.label ?? s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-20 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading plans…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <Repeat className="mb-3 h-10 w-10 text-slate-200" />
            <p className="font-semibold text-slate-600">No recurring plans found</p>
            <p className="mt-1 text-sm text-slate-400">
              {search || statusFilter !== "all" ? "Try adjusting your filters." : "No recurring plans yet."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Customer", "Service", "Frequency", "Next visit", "Price", "Status", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((plan) => {
                  const status = (plan.status as PlanStatus) ?? "active";
                  const sm = STATUS_MAP[status] ?? STATUS_MAP.active;
                  return (
                    <tr key={plan.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{plan.customer_name ?? "—"}</p>
                        {plan.customer_email && <p className="text-xs text-slate-400">{plan.customer_email}</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{plan.service_label ?? "Standard Clean"}</td>
                      <td className="px-4 py-3 text-slate-600">{FREQ_LABELS[plan.frequency] ?? plan.frequency}</td>
                      <td className="px-4 py-3 text-slate-600">{plan.next_run_date ?? "—"}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        R {(plan.price ?? 0).toLocaleString("en-ZA")}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", sm.cls)}>
                          {sm.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {actionLoading === plan.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                          ) : status === "active" ? (
                            <button
                              type="button"
                              onClick={() => void handleAction(plan.id, "pause")}
                              className="rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-100"
                            >
                              <Pause className="inline h-3 w-3 mr-1" />Pause
                            </button>
                          ) : status === "paused" ? (
                            <button
                              type="button"
                              onClick={() => void handleAction(plan.id, "resume")}
                              className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                            >
                              <PlayCircle className="inline h-3 w-3 mr-1" />Resume
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
