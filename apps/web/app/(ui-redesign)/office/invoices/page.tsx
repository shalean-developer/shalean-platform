"use client";

import { useState } from "react";
import { Search, Download, RefreshCw, AlertCircle, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminData } from "@/hooks/useAdminData";

type InvoiceRow = {
  id: string;
  customer_email: string | null;
  customer_name: string | null;
  month_label: string | null;
  total_zar: number | null;
  balance_zar: number | null;
  status: string | null;
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
  booking_count?: number;
};

type InvoicesResponse = {
  invoices: InvoiceRow[];
};

const STATUS_MAP: Record<string, { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  paid:    { label: "Paid",    cls: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  unpaid:  { label: "Unpaid",  cls: "bg-orange-100 text-orange-700",  icon: Clock },
  overdue: { label: "Overdue", cls: "bg-red-100 text-red-700",        icon: AlertTriangle },
};

function formatZar(zar: number | null): string {
  if (zar == null) return "—";
  return `R ${Math.round(zar).toLocaleString("en-ZA")}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

export default function InvoicesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const params: Record<string, string> = {};
  if (statusFilter !== "all") params.status = statusFilter;
  if (search) params.q = search;

  const { data, loading, error, refetch } = useAdminData<InvoicesResponse>(
    "/api/admin/invoices",
    { params },
  );

  const invoices = data?.invoices ?? [];

  const filtered = search
    ? invoices.filter(
        (inv) =>
          (inv.customer_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (inv.customer_email ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (inv.id ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : invoices;

  const paidCount = invoices.filter((inv) => (inv.status ?? "").toLowerCase() === "paid").length;
  const unpaidCount = invoices.filter((inv) => (inv.status ?? "").toLowerCase() === "unpaid").length;
  const overdueCount = invoices.filter((inv) => (inv.status ?? "").toLowerCase() === "overdue").length;
  const totalOutstanding = invoices
    .filter((inv) => (inv.status ?? "").toLowerCase() !== "paid")
    .reduce((s, inv) => s + (inv.balance_zar ?? inv.total_zar ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
          <p className="mt-0.5 text-sm text-slate-500">Monthly invoice summaries for all customers.</p>
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
          { label: "Total invoices",  value: loading ? "—" : invoices.length, color: "text-slate-800" },
          { label: "Paid",            value: loading ? "—" : paidCount,        color: "text-emerald-600" },
          { label: "Overdue",         value: loading ? "—" : overdueCount,     color: overdueCount > 0 ? "text-red-600" : "text-slate-400" },
          { label: "Outstanding",     value: loading ? "—" : formatZar(totalOutstanding), color: "text-orange-600" },
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
              placeholder="Search invoices…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm placeholder:text-slate-400 focus:outline-none focus:border-blue-300"
            />
          </div>
          <div className="flex gap-1">
            {(["all", "paid", "unpaid", "overdue"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
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
                {["Invoice", "Customer", "Period", "Bookings", "Amount", "Due", "Status", ""].map((h) => (
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
                    <td colSpan={8} className="px-4 py-3">
                      <div className="h-5 animate-pulse rounded-lg bg-slate-100" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-slate-400">
                    No invoices found.
                  </td>
                </tr>
              ) : (
                filtered.map((inv) => {
                  const statusKey = (inv.status ?? "unpaid").toLowerCase();
                  const s = STATUS_MAP[statusKey] ?? { label: inv.status ?? "—", cls: "bg-slate-100 text-slate-600", icon: Clock };
                  const SIcon = s.icon;
                  return (
                    <tr key={inv.id} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono font-bold text-blue-600">
                          {inv.id.slice(0, 8).toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-slate-800">
                          {inv.customer_name ?? inv.customer_email ?? "—"}
                        </p>
                        {inv.customer_name && (
                          <p className="text-xs text-slate-400">{inv.customer_email}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {inv.month_label ?? formatDate(inv.created_at)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {inv.booking_count ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-bold text-slate-800">
                          {formatZar(inv.total_zar)}
                        </span>
                        {inv.balance_zar != null && inv.balance_zar !== inv.total_zar && (
                          <p className="text-xs text-orange-600">
                            Balance: {formatZar(inv.balance_zar)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {formatDate(inv.due_date)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <SIcon className="h-3.5 w-3.5" />
                          <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", s.cls)}>
                            {s.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={`/admin/invoices/${inv.id}`}
                          className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-100 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          View
                        </a>
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
            {loading ? "Loading…" : `${filtered.length} of ${invoices.length} invoices`}
          </p>
        </div>
      </div>
    </div>
  );
}
