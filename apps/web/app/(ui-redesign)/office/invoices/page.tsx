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
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminData } from "@/hooks/useAdminData";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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

function InvoiceCard({ inv }: { inv: AdminInvoiceListRow }) {
  const s = statusPresentation(inv.status);
  const SIcon = s.icon;
  const href = `/office/invoices/${inv.id}`;
  return (
    <Link
      href={href}
      className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 transition-colors last:border-b-0 active:bg-slate-50"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-slate-900">
            {(inv.customer_name ?? "").trim() || "—"}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {formatInvoiceMonth(inv.month)} · {inv.id.slice(0, 8).toUpperCase()}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold tabular-nums text-slate-900">
            {formatCurrency(inv.total_amount_cents, inv.currency_code)}
          </p>
          {inv.balance_cents > 0 ? (
            <p className="text-xs font-medium tabular-nums text-orange-600">
              Due {formatCurrency(inv.balance_cents, inv.currency_code)}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold capitalize", s.cls)}>
          <SIcon className="h-3 w-3" />
          {s.label}
        </span>
        {inv.days_overdue > 0 && inv.status.toLowerCase() !== "paid" && inv.balance_cents > 0 ? (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
            {inv.days_overdue}d overdue
          </span>
        ) : null}
        <span className="text-xs text-slate-500">Due {formatDueDateLabel(inv.due_date)}</span>
        <span className="text-xs text-slate-400">
          {inv.booking_count} booking{inv.booking_count === 1 ? "" : "s"}
        </span>
        {inv.view_count > 0 ? (
          <span className="text-[10px] text-slate-400">Opened {inv.view_count}×</span>
        ) : null}
      </div>
      <span className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-50 py-2.5 text-sm font-semibold text-blue-600">
        View invoice
        <ChevronRight className="h-4 w-4" aria-hidden />
      </span>
    </Link>
  );
}

const OUTSTANDING_TOOLTIP =
  "Sum of unpaid balances on all invoices in the list (every month). For current recurring billing, compare with the month draft total on /office/recurring.";

function SummaryStatCard({
  label,
  value,
  color,
  tooltip,
  wide = false,
}: {
  label: string;
  value: string | number;
  color: string;
  tooltip?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "shrink-0 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm md:shrink md:p-4",
        wide ? "min-w-[9.5rem]" : "min-w-[7.25rem]",
      )}
    >
      <div className="flex items-center gap-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">{label}</p>
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex rounded-full text-slate-400 transition hover:text-slate-600"
                aria-label={`About ${label}`}
              >
                <HelpCircle className="h-3 w-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start" className="max-w-[16rem] text-left text-xs leading-relaxed">
              {tooltip}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <p className={cn("mt-1 text-lg font-bold tabular-nums sm:text-2xl", color)}>{value}</p>
    </div>
  );
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
          {inv.days_overdue > 0 && inv.status.toLowerCase() !== "paid" && inv.balance_cents > 0 ? (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
              {inv.days_overdue}d overdue
            </span>
          ) : null}
          {inv.view_count > 0 ? (
            <p className="w-full text-[10px] text-slate-400">
              Opened {inv.view_count}×
              {inv.first_viewed_at
                ? ` · ${new Date(inv.first_viewed_at).toLocaleDateString("en-ZA", { dateStyle: "medium" })}`
                : ""}
            </p>
          ) : null}
        </div>
      </td>
      <td className="px-4 py-3">
        <Link
          href={`/office/invoices/${inv.id}`}
          className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-100 transition-colors"
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
    <div className="min-w-0 max-w-full space-y-5 overflow-x-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Monthly billing</h1>
          <p className="mt-0.5 text-sm text-slate-500">Consolidated monthly invoices for recurring customers.</p>
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

      <TooltipProvider delayDuration={200}>
        <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1 md:mx-0 md:grid md:grid-cols-2 md:gap-3 md:overflow-visible lg:grid-cols-4">
          <SummaryStatCard label="Invoices" value={loading ? "—" : totalInvoices} color="text-slate-800" />
          <SummaryStatCard label="Paid" value={loading ? "—" : paidCount} color="text-emerald-600" />
          <SummaryStatCard
            label="Overdue"
            value={loading ? "—" : overdueCount}
            color={overdueCount > 0 ? "text-red-600" : "text-slate-400"}
          />
          <SummaryStatCard
            label="Unpaid"
            value={loading ? "—" : totalOutstandingCents <= 0 ? "R 0" : formatCurrency(totalOutstandingCents, "ZAR")}
            color="text-orange-600"
            tooltip={OUTSTANDING_TOOLTIP}
            wide
          />
        </div>
      </TooltipProvider>

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="space-y-3 border-b border-slate-100 px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search invoices…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm placeholder:text-slate-400 focus:border-blue-300 focus:outline-none"
            />
          </div>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
            {(["all", "paid", "unpaid", "overdue"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold capitalize transition-colors",
                  statusFilter === s ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}
              >
                {s === "all" ? "All" : s}
              </button>
            ))}
          </div>
        </div>

        <div className="md:hidden">
          {loading ? (
            <div className="space-y-3 px-4 py-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : invoices.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-slate-400">No invoices found.</p>
          ) : monthGroups.length > 0 ? (
            monthGroups.map((group) => {
              const groupTotalCents = group.invoices.reduce((sum, inv) => sum + inv.total_amount_cents, 0);
              const groupOutstandingCents = group.invoices.reduce(
                (sum, inv) => sum + Math.max(0, inv.balance_cents),
                0,
              );
              return (
                <MonthGroupMobileSection
                  key={group.month}
                  group={group}
                  groupTotalCents={groupTotalCents}
                  groupOutstandingCents={groupOutstandingCents}
                />
              );
            })
          ) : (
            invoices.map((inv) => <InvoiceCard key={inv.id} inv={inv} />)
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] text-sm">
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

        <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-400">
            {loading
              ? "Loading…"
              : pagination.total === 0
                ? "No invoices"
                : `Showing ${pagination.from}–${pagination.to} of ${pagination.total} invoices across ${pagination.totalMonths} month${pagination.totalMonths === 1 ? "" : "s"}`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex w-full items-center justify-between gap-2 text-xs text-slate-500 sm:w-auto sm:justify-start">
              Months per page
              <select
                value={monthsPerPage}
                onChange={(e) => setMonthsPerPage(Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700"
              >
                {[1, 2, 3, 6, 12].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
              <span className="text-xs font-medium text-slate-500">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={loading || !pagination.hasPreviousPage}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Prev
                </button>
                <button
                  type="button"
                  disabled={loading || !pagination.hasNextPage}
                  onClick={() => setPage((p) => p + 1)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MonthGroupMobileSection({
  group,
  groupTotalCents,
  groupOutstandingCents,
}: {
  group: AdminInvoiceMonthGroup;
  groupTotalCents: number;
  groupOutstandingCents: number;
}) {
  return (
    <section className="border-b border-slate-200 last:border-b-0">
      <div className="bg-slate-50 px-4 py-3">
        <p className="text-sm font-bold text-slate-800">{formatInvoiceMonth(group.month)}</p>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
          <span>
            {group.invoices.length} invoice{group.invoices.length === 1 ? "" : "s"}
          </span>
          <span className="font-semibold text-slate-800">
            Total {formatCurrency(groupTotalCents, group.invoices[0]?.currency_code ?? "ZAR")}
          </span>
          {groupOutstandingCents > 0 ? (
            <span className="font-semibold text-orange-600">
              Unpaid {formatCurrency(groupOutstandingCents, group.invoices[0]?.currency_code ?? "ZAR")}
            </span>
          ) : null}
        </p>
      </div>
      {group.invoices.map((inv) => (
        <InvoiceCard key={inv.id} inv={inv} />
      ))}
    </section>
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
                  Unpaid: {formatCurrency(groupOutstandingCents, group.invoices[0]?.currency_code ?? "ZAR")}
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
