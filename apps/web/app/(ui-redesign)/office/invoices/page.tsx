"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Search,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminData } from "@/hooks/useAdminData";
import {
  formatCurrency,
  formatDueDateLabel,
  formatInvoiceMonth,
} from "@/lib/admin/invoices/invoiceAdminFormatters";
import type {
  AdminInvoiceListRow,
  AdminInvoiceListPagination,
  AdminInvoiceListSummary,
  AdminInvoiceMonthGroup,
} from "@/lib/admin/invoices/loadAdminInvoiceList";

type InvoicesResponse = {
  invoices: AdminInvoiceListRow[];
  monthGroups?: AdminInvoiceMonthGroup[];
  pagination?: AdminInvoiceListPagination;
  summary?: AdminInvoiceListSummary;
};

function statusPresentation(status: string): {
  label: string;
  cls: string;
  icon: React.ComponentType<{ className?: string }>;
} {
  const s = status.toLowerCase();
  if (s === "paid") return { label: "Paid", cls: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 };
  if (s === "overdue") return { label: "Overdue", cls: "bg-red-100 text-red-700", icon: AlertTriangle };
  if (s === "partially_paid") return { label: "Partial", cls: "bg-amber-100 text-amber-800", icon: Clock };
  if (s === "sent") return { label: "Sent", cls: "bg-blue-100 text-blue-700", icon: Clock };
  if (s === "draft") return { label: "Draft", cls: "bg-slate-100 text-slate-600", icon: Clock };
  return { label: status.replace(/_/g, " "), cls: "bg-orange-100 text-orange-700", icon: Clock };
}

function InvoiceRow({ inv }: { inv: AdminInvoiceListRow }) {
  const s = statusPresentation(inv.status);
  const SIcon = s.icon;
  return (
    <tr className="group hover:bg-slate-50/50 transition-colors">
      <td className="px-4 py-3">
        <span className="text-xs font-mono font-bold text-blue-600">{inv.id.slice(0, 8).toUpperCase()}</span>
      </td>
      <td className="px-4 py-3">
        <p className="text-sm font-semibold text-slate-800">{(inv.customer_name ?? "").trim() || "—"}</p>
        <p className="text-xs text-slate-400">{inv.customer_id.slice(0, 8)}…</p>
      </td>
      <td className="px-4 py-3 text-sm tabular-nums text-slate-600">{inv.booking_count}</td>
      <td className="px-4 py-3">
        <span className="text-sm font-bold text-slate-800">
          {formatCurrency(inv.total_amount_cents, inv.currency_code)}
        </span>
        {inv.balance_cents > 0 && (
          <p className="text-xs text-orange-600">
            Balance: {formatCurrency(inv.balance_cents, inv.currency_code)}
          </p>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">{formatDueDateLabel(inv.due_date)}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <SIcon className="h-3.5 w-3.5" />
          <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold capitalize", s.cls)}>{s.label}</span>
          {inv.days_overdue > 0 ? (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
              {inv.days_overdue}d overdue
            </span>
          ) : null}
        </div>
      </td>
      <td className="px-4 py-3">
        <Link
          href={`/office/invoices/${inv.id}`}
          className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-100 transition-colors opacity-0 group-hover:opacity-100"
        >
          View
        </Link>
      </td>
    </tr>
  );
}

export default function InvoicesPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [monthsPerPage, setMonthsPerPage] = useState(3);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => globalThis.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => setPage(1), 0);
    return () => globalThis.clearTimeout(timer);
  }, [debouncedSearch, statusFilter, monthsPerPage]);

  const params: Record<string, string> = {
    page: String(page),
    monthsPerPage: String(monthsPerPage),
  };
  if (statusFilter !== "all") params.status = statusFilter;
  if (debouncedSearch) params.q = debouncedSearch;

  const { data, loading, error, refetch } = useAdminData<InvoicesResponse>("/api/admin/invoices", { params });

  const monthGroups = data?.monthGroups ?? [];
  const invoices = data?.invoices ?? [];
  const summary = data?.summary;
  const pagination = data?.pagination ?? {
    page,
    pageSize: monthsPerPage,
    total: invoices.length,
    totalMonths: monthGroups.length,
    totalPages: 1,
    from: invoices.length > 0 ? 1 : 0,
    to: invoices.length,
    hasNextPage: false,
    hasPreviousPage: false,
  };

  useEffect(() => {
    if (data?.pagination && page > data.pagination.totalPages) {
      const timer = globalThis.setTimeout(() => setPage(Math.max(1, data.pagination!.totalPages)), 0);
      return () => globalThis.clearTimeout(timer);
    }
  }, [data?.pagination, page]);

  const totalInvoices = summary?.total_invoices ?? pagination.total;
  const paidCount = summary?.paid_count ?? 0;
  const overdueCount = summary?.overdue_count ?? 0;
  const totalOutstandingCents = summary?.total_outstanding_cents ?? 0;

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
          <button type="button" onClick={() => void refetch()} className="ml-auto text-xs font-semibold text-red-600 hover:underline">
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total invoices", value: loading ? "—" : totalInvoices, color: "text-slate-800" },
          { label: "Paid", value: loading ? "—" : paidCount, color: "text-emerald-600" },
          {
            label: "Overdue",
            value: loading ? "—" : overdueCount,
            color: overdueCount > 0 ? "text-red-600" : "text-slate-400",
          },
          {
            label: "Outstanding",
            value: loading ? "—" : totalOutstandingCents <= 0 ? "R 0" : formatCurrency(totalOutstandingCents, "ZAR"),
            color: "text-orange-600",
          },
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
                {s === "all" ? "All" : s}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                {["Invoice", "Customer", "Bookings", "Amount", "Due", "Status", ""].map((h) => (
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
                    <td colSpan={7} className="px-4 py-3">
                      <div className="h-5 animate-pulse rounded-lg bg-slate-100" />
                    </td>
                  </tr>
                ))
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-sm text-slate-400">
                    No invoices found.
                  </td>
                </tr>
              ) : monthGroups.length > 0 ? (
                monthGroups.map((group) => {
                  const groupTotalCents = group.invoices.reduce((sum, inv) => sum + inv.total_amount_cents, 0);
                  const groupOutstandingCents = group.invoices.reduce(
                    (sum, inv) => sum + Math.max(0, inv.balance_cents),
                    0,
                  );
                  return (
                    <MonthGroupSection
                      key={group.month}
                      group={group}
                      groupTotalCents={groupTotalCents}
                      groupOutstandingCents={groupOutstandingCents}
                    />
                  );
                })
              ) : (
                invoices.map((inv) => <InvoiceRow key={inv.id} inv={inv} />)
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
          <p className="text-xs text-slate-400">
            {loading
              ? "Loading…"
              : pagination.total === 0
                ? "No invoices"
                : `Showing ${pagination.from}–${pagination.to} of ${pagination.total} invoices across ${pagination.totalMonths} month${pagination.totalMonths === 1 ? "" : "s"}`}
          </p>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-500">
              Months per page
              <select
                value={monthsPerPage}
                onChange={(e) => setMonthsPerPage(Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
              >
                {[1, 2, 3, 6, 12].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-xs font-medium text-slate-500">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              type="button"
              disabled={loading || !pagination.hasPreviousPage}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </button>
            <button
              type="button"
              disabled={loading || !pagination.hasNextPage}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MonthGroupSection({
  group,
  groupTotalCents,
  groupOutstandingCents,
}: {
  group: AdminInvoiceMonthGroup;
  groupTotalCents: number;
  groupOutstandingCents: number;
}) {
  return (
    <>
      <tr className="bg-slate-100/70">
        <td colSpan={7} className="px-4 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-slate-800">{formatInvoiceMonth(group.month)}</p>
              <p className="text-[11px] font-medium text-slate-500">{group.month}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
              <span>
                {group.invoices.length} invoice{group.invoices.length === 1 ? "" : "s"}
              </span>
              <span className="font-semibold text-slate-800">
                Total: {formatCurrency(groupTotalCents, group.invoices[0]?.currency_code ?? "ZAR")}
              </span>
              {groupOutstandingCents > 0 ? (
                <span className="font-semibold text-orange-600">
                  Outstanding: {formatCurrency(groupOutstandingCents, group.invoices[0]?.currency_code ?? "ZAR")}
                </span>
              ) : null}
            </div>
          </div>
        </td>
      </tr>
      {group.invoices.map((inv) => (
        <InvoiceRow key={inv.id} inv={inv} />
      ))}
    </>
  );
}
