"use client";

import { useState } from "react";
import { Search, Download, RefreshCw, AlertCircle, CheckCircle2, Clock, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminData, adminFetch } from "@/hooks/useAdminData";

type PayoutRow = {
  id: string;
  cleaner_id: string;
  cleaner_name: string;
  booking_count: number;
  total_amount_cents: number;
  status: string;
  payment_status: string | null;
  payment_reference: string | null;
  period_start: string;
  period_end: string;
  created_at: string;
  approved_at: string | null;
  paid_at: string | null;
};

type PayoutsResponse = {
  payouts: PayoutRow[];
};

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pending:   { label: "Pending",   cls: "bg-orange-100 text-orange-700" },
  approved:  { label: "Approved",  cls: "bg-blue-100 text-blue-700" },
  paid:      { label: "Paid",      cls: "bg-emerald-100 text-emerald-700" },
  disputed:  { label: "Disputed",  cls: "bg-red-100 text-red-700" },
  on_hold:   { label: "On Hold",   cls: "bg-slate-100 text-slate-600" },
};

function formatZar(cents: number): string {
  return `R ${Math.round(cents / 100).toLocaleString("en-ZA")}`;
}

function formatPeriod(start: string, end: string): string {
  const s = new Date(start).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
  const e = new Date(end).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
  return `${s} – ${e}`;
}

export default function PayoutsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const { data, loading, error, refetch } = useAdminData<PayoutsResponse>("/api/admin/payouts");

  const payouts = data?.payouts ?? [];

  const filtered = payouts.filter((p) => {
    const s =
      !search ||
      (p.cleaner_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (p.id ?? "").toLowerCase().includes(search.toLowerCase());
    const sf = statusFilter === "all" || (p.status ?? "").toLowerCase() === statusFilter;
    return s && sf;
  });

  const pendingCount = payouts.filter((p) => (p.status ?? "").toLowerCase() === "pending").length;
  const paidCount = payouts.filter((p) => (p.status ?? "").toLowerCase() === "paid").length;
  const totalPendingCents = payouts
    .filter((p) => (p.status ?? "").toLowerCase() === "pending")
    .reduce((s, p) => s + (p.total_amount_cents ?? 0), 0);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleApprove(id: string) {
    setActionLoading(id);
    const res = await adminFetch(`/api/admin/payouts/${id}/approve`, { method: "POST" });
    setActionLoading(null);
    if (res.ok) {
      showToast("Payout approved", true);
      void refetch();
    } else {
      showToast(res.error ?? "Failed to approve", false);
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
          <h1 className="text-2xl font-bold text-slate-900">Cleaner Payouts</h1>
          <p className="mt-0.5 text-sm text-slate-500">Review and approve earnings payouts for cleaners.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refetch()}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 shadow-sm"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 shadow-sm"
          >
            <Download className="h-4 w-4" /> Export
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={() => void refetch()} className="ml-auto text-xs font-semibold text-red-600 hover:underline">Retry</button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total payouts",  value: loading ? "—" : payouts.length,      color: "text-slate-800" },
          { label: "Pending",        value: loading ? "—" : pendingCount,         color: "text-orange-600" },
          { label: "Paid",           value: loading ? "—" : paidCount,            color: "text-emerald-600" },
          { label: "Pending amount", value: loading ? "—" : formatZar(totalPendingCents), color: "text-blue-600" },
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
              placeholder="Search payouts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm placeholder:text-slate-400 focus:outline-none focus:border-blue-300"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {(["all", "pending", "approved", "paid", "disputed", "on_hold"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  statusFilter === s ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100",
                )}
              >
                {s === "all" ? "All" : STATUS_MAP[s]?.label ?? s}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                {["Cleaner", "Period", "Jobs", "Net payout", "Status", "Actions"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-4 py-3">
                      <div className="h-5 animate-pulse rounded-lg bg-slate-100" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-slate-400">
                    No payouts found.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const statusKey = (p.status ?? "pending").toLowerCase();
                  const s = STATUS_MAP[statusKey] ?? { label: p.status ?? "—", cls: "bg-slate-100 text-slate-600" };
                  const isPending = statusKey === "pending";

                  return (
                    <tr key={p.id} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-slate-800">{p.cleaner_name}</p>
                        <p className="text-xs text-slate-400 font-mono">{p.id.slice(0, 8).toUpperCase()}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {formatPeriod(p.period_start, p.period_end)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">{p.booking_count}</td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-bold text-slate-800">
                          {formatZar(p.total_amount_cents)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", s.cls)}>
                          {s.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {isPending && (
                            <button
                              type="button"
                              disabled={actionLoading === p.id}
                              onClick={() => void handleApprove(p.id)}
                              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Approve
                            </button>
                          )}
                          <a
                            href={`/admin/payouts/${p.id}`}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                          >
                            View
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center border-t border-slate-100 px-4 py-3">
          <p className="text-xs text-slate-400">
            {loading ? "Loading…" : `${filtered.length} of ${payouts.length} payouts`}
          </p>
        </div>
      </div>
    </div>
  );
}
