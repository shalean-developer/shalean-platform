"use client";

import { useState } from "react";
import { Search, CheckCircle2, XCircle, RefreshCw, AlertCircle, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatCleanerApplyWorkingAreas,
  formatCleanerApplyWorkingDays,
} from "@/lib/cleaner/cleanerApplicationFields";
import { useAdminData, adminFetch } from "@/hooks/useAdminData";

type ApplicationRow = {
  id: string;
  name: string | null;
  phone: string | null;
  location: string | null;
  city_id: string | null;
  experience: string | null;
  availability: string[] | null;
  working_areas: string[] | null;
  working_days: string[] | null;
  status: "pending" | "approved" | "rejected" | string;
  created_at: string;
};

type ApplicationsResponse = {
  applications: ApplicationRow[];
  stats: { pendingCount: number; approvedToday: number; totalCleaners: number };
};

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pending:  { label: "Pending",  cls: "bg-orange-100 text-orange-700" },
  approved: { label: "Approved", cls: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rejected", cls: "bg-red-100 text-red-700" },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

export default function CleanerApplicationsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const { data, loading, error, refetch } = useAdminData<ApplicationsResponse>(
    "/api/admin/cleaner-applications",
  );

  const applications = data?.applications ?? [];
  const stats = data?.stats;

  const filtered = applications.filter((a) => {
    const s =
      !search ||
      (a.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (a.location ?? "").toLowerCase().includes(search.toLowerCase());
    const sf = statusFilter === "all" || (a.status ?? "").toLowerCase() === statusFilter;
    return s && sf;
  });

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleAction(id: string, action: "approve" | "reject") {
    setActionLoading(`${id}-${action}`);
    const res = await adminFetch(`/api/admin/cleaner-applications/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
    });
    setActionLoading(null);
    if (res.ok) {
      showToast(`Application ${action}d`, true);
      void refetch();
    } else {
      showToast(res.error ?? `Failed to ${action}`, false);
    }
  }

  return (
    <div className="space-y-5">
      {toast && (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-50 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg",
            toast.ok ? "bg-emerald-600" : "bg-red-600",
          )}
        >
          {toast.msg}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cleaner Applications</h1>
          <p className="mt-0.5 text-sm text-slate-500">Review and process new cleaner applicants.</p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 shadow-sm"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={() => void refetch()} className="ml-auto text-xs font-semibold text-red-600 hover:underline">Retry</button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: "Pending review",    value: loading ? "—" : (stats?.pendingCount ?? 0),  color: "text-orange-600" },
          { label: "Approved today",    value: loading ? "—" : (stats?.approvedToday ?? 0), color: "text-emerald-600" },
          { label: "Total cleaners",    value: loading ? "—" : (stats?.totalCleaners ?? 0), color: "text-slate-800" },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search applicants…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm placeholder:text-slate-400 focus:outline-none focus:border-blue-300"
            />
          </div>
          <div className="flex gap-1">
            {(["all", "pending", "approved", "rejected"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors capitalize",
                  statusFilter === s ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100",
                )}
              >
                {s === "all" ? "All" : STATUS_MAP[s]?.label ?? s}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-slate-50">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="px-5 py-4">
                <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">No applications found.</div>
          ) : (
            filtered.map((a) => {
              const statusInfo = STATUS_MAP[a.status?.toLowerCase() ?? ""] ?? {
                label: a.status ?? "—",
                cls: "bg-slate-100 text-slate-600",
              };
              const isPending = (a.status ?? "").toLowerCase() === "pending";

              return (
                <div
                  key={a.id}
                  className="flex items-start gap-4 px-5 py-4 hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                    {(a.name ?? "?")
                      .split(" ")
                      .map((n) => n[0] ?? "")
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-800">{a.name ?? "—"}</p>
                      <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", statusInfo.cls)}>
                        {statusInfo.label}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      {a.phone && <span>{a.phone}</span>}
                      {a.location && <span>📍 {a.location}</span>}
                      {a.experience && <span>Experience: {a.experience}</span>}
                      {(a.availability ?? []).length > 0 && (
                        <span>Available: {(a.availability ?? []).join(", ")}</span>
                      )}
                      {formatCleanerApplyWorkingAreas(a.working_areas) && (
                        <span>Areas: {formatCleanerApplyWorkingAreas(a.working_areas)}</span>
                      )}
                      {formatCleanerApplyWorkingDays(a.working_days) && (
                        <span>Days: {formatCleanerApplyWorkingDays(a.working_days)}</span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                      <Clock className="h-3 w-3" />
                      Applied {formatDate(a.created_at)}
                    </div>
                  </div>
                  {isPending && (
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        disabled={actionLoading === `${a.id}-approve`}
                        onClick={() => void handleAction(a.id, "approve")}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                      >
                        {actionLoading === `${a.id}-approve` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={actionLoading === `${a.id}-reject`}
                        onClick={() => void handleAction(a.id, "reject")}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        {actionLoading === `${a.id}-reject` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" />
                        )}
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
          <p className="text-xs text-slate-400">
            {loading ? "Loading…" : `${filtered.length} of ${applications.length} applications`}
          </p>
        </div>
      </div>
    </div>
  );
}
