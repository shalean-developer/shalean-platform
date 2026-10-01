"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  RefreshCw,
  Search,
} from "lucide-react";

import { adminFetch, getAdminToken, useAdminData } from "@/hooks/useAdminData";
import type {
  AdminInvoiceRegistryKindFilter,
  AdminInvoiceRegistryPayload,
  AdminInvoiceRegistryRow,
  AdminInvoiceRegistryStatusFilter,
} from "@/lib/admin/invoices/loadAdminInvoiceRegistry";
import { cn } from "@/lib/utils";

const KIND_TABS: Array<{ key: AdminInvoiceRegistryKindFilter; label: string }> = [
  { key: "all", label: "All documents" },
  { key: "invoices", label: "All invoices" },
  { key: "monthly_invoice", label: "Monthly" },
  { key: "booking_invoice", label: "Bookings" },
  { key: "sales_invoice", label: "Sales invoices" },
  { key: "quote", label: "Quotes" },
];

const STATUS_TABS: Array<{ key: AdminInvoiceRegistryStatusFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "paid", label: "Paid" },
  { key: "unpaid", label: "Unpaid" },
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
  { key: "overdue", label: "Overdue" },
  { key: "missing_zoho", label: "Missing Zoho" },
];

function zar(cents: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 2,
  }).format(Math.max(0, cents) / 100);
}

function kindLabel(kind: AdminInvoiceRegistryRow["kind"]): string {
  switch (kind) {
    case "monthly_invoice":
      return "Monthly invoice";
    case "booking_invoice":
      return "Booking invoice";
    case "sales_invoice":
      return "Sales invoice";
    case "quote":
      return "Quote";
  }
}

function originLabel(origin: string): string {
  const normalized = origin.toLowerCase();
  if (normalized === "website") return "Website";
  if (normalized === "admin") return "Admin";
  if (normalized === "whatsapp") return "WhatsApp";
  if (normalized === "monthly") return "Monthly billing";
  return origin.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function statusClass(row: AdminInvoiceRegistryRow): string {
  if (row.is_overdue) return "bg-red-100 text-red-700";
  const s = row.status.toLowerCase();
  if (s === "paid") return "bg-emerald-100 text-emerald-700";
  if (s === "draft" || s === "requested") return "bg-slate-100 text-slate-600";
  if (s === "sent" || s === "accepted") return "bg-blue-100 text-blue-700";
  if (s === "refunded" || s === "void") return "bg-violet-100 text-violet-700";
  return "bg-amber-100 text-amber-800";
}

function statusLabel(row: AdminInvoiceRegistryRow): string {
  if (row.is_overdue) return "Overdue";
  return row.status.replace(/_/g, " ");
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm sm:rounded-2xl sm:p-4">
      <p className="truncate text-[9px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[11px]">
        {label}
      </p>
      <p className="mt-0.5 whitespace-nowrap text-base font-bold tabular-nums text-slate-900 sm:mt-1 sm:text-2xl">
        {value}
      </p>
      {hint ? <p className="mt-1 hidden text-xs text-slate-500 sm:block">{hint}</p> : null}
    </div>
  );
}

function ZohoState({ row }: { row: AdminInvoiceRegistryRow }) {
  if (row.zoho_linked) {
    return (
      <div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
          <CheckCircle2 className="h-3 w-3" />
          {row.zoho_number || "In Zoho"}
        </span>
        {row.zoho_status ? (
          <p className="mt-1 text-[10px] capitalize text-slate-400">
            {row.zoho_status.replace(/_/g, " ")}
            {row.zoho_balance_cents != null ? ` · ${zar(row.zoho_balance_cents)} balance` : ""}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <div>
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
        <AlertCircle className="h-3 w-3" />
        Missing
      </span>
      {row.sync_hold_reason ? (
        <p className="mt-1 text-[10px] text-slate-500">{row.sync_hold_reason}</p>
      ) : null}
    </div>
  );
}

function RegistryActions({
  row,
  syncing,
  onSync,
}: {
  row: AdminInvoiceRegistryRow;
  syncing: boolean;
  onSync: (row: AdminInvoiceRegistryRow) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {row.sync_eligible ? (
        <button
          type="button"
          disabled={syncing}
          onClick={() => onSync(row)}
          className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
        >
          {syncing ? "Syncing…" : "Sync to Zoho"}
        </button>
      ) : null}
      {row.pdf_href ? (
        <a
          href={row.pdf_href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          PDF <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
      <Link
        href={row.href}
        className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
      >
        View
      </Link>
    </div>
  );
}

function RegistryCard({
  row,
  syncing,
  onSync,
}: {
  row: AdminInvoiceRegistryRow;
  syncing: boolean;
  onSync: (row: AdminInvoiceRegistryRow) => void;
}) {
  return (
    <article className="space-y-3 border-b border-slate-100 px-4 py-4 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-sm font-bold text-blue-700">{row.reference}</p>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
              {kindLabel(row.kind)}
            </span>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
              {originLabel(row.origin)}
            </span>
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-slate-900">{row.customer_name}</p>
          {row.customer_email ? (
            <p className="truncate text-xs text-slate-400">{row.customer_email}</p>
          ) : null}
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold capitalize", statusClass(row))}>
          {statusLabel(row)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-slate-400">Total</p>
          <p className="font-semibold text-slate-800">{zar(row.amount_cents)}</p>
        </div>
        <div>
          <p className="text-slate-400">Paid</p>
          <p className="font-semibold text-emerald-700">{zar(row.amount_paid_cents)}</p>
        </div>
        <div>
          <p className="text-slate-400">Balance</p>
          <p className={cn("font-semibold", row.balance_cents > 0 ? "text-orange-700" : "text-slate-700")}>
            {zar(row.balance_cents)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Payment source</p>
          <p className="text-xs font-semibold text-slate-700">{row.payment_source}</p>
        </div>
        <ZohoState row={row} />
      </div>

      <RegistryActions row={row} syncing={syncing} onSync={onSync} />
    </article>
  );
}

export default function InvoicesPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [kind, setKind] = useState<AdminInvoiceRegistryKindFilter>("all");
  const [status, setStatus] = useState<AdminInvoiceRegistryStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => globalThis.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => setPage(1), 0);
    return () => globalThis.clearTimeout(timer);
  }, [debouncedSearch, kind, status, pageSize]);

  const params = useMemo(() => {
    const next: Record<string, string> = {
      kind,
      status,
      page: String(page),
      page_size: String(pageSize),
    };
    if (debouncedSearch) next.q = debouncedSearch;
    return next;
  }, [debouncedSearch, kind, page, pageSize, status]);

  const { data, loading, error, refetch } = useAdminData<AdminInvoiceRegistryPayload>(
    "/api/admin/invoice-registry",
    { params },
  );

  const rows = data?.rows ?? [];
  const summary = data?.summary;
  const pagination = data?.pagination ?? {
    page: 1,
    page_size: pageSize,
    total_filtered: 0,
    total_pages: 1,
    from: 0,
    to: 0,
    has_next_page: false,
    has_previous_page: false,
  };

  useEffect(() => {
    if (data?.pagination && page > data.pagination.total_pages) {
      const timer = globalThis.setTimeout(() => setPage(data.pagination.page), 0);
      return () => globalThis.clearTimeout(timer);
    }
  }, [data?.pagination, page]);

  async function syncToZoho(row: AdminInvoiceRegistryRow) {
    if (syncingId) return;
    setActionError(null);
    setSyncingId(row.registry_id);
    const result = await adminFetch<{ ok?: boolean; zoho_id?: string }>(
      "/api/admin/billing-documents/sync",
      {
        method: "POST",
        body: JSON.stringify({ kind: row.kind, id: row.entity_id }),
      },
    );
    setSyncingId(null);
    if (!result.ok) {
      setActionError(result.error ?? "Zoho sync failed.");
      return;
    }
    await refetch();
  }

  async function exportRegistry() {
    if (exporting) return;
    setExporting(true);
    setActionError(null);
    try {
      const token = await getAdminToken();
      if (!token) throw new Error("Not authenticated");

      const allRows: AdminInvoiceRegistryRow[] = [];
      let exportPage = 1;
      for (;;) {
        const searchParams = new URLSearchParams({
          kind,
          status,
          page: String(exportPage),
          page_size: "100",
        });
        if (debouncedSearch) searchParams.set("q", debouncedSearch);

        const response = await fetch(`/api/admin/invoice-registry?${searchParams.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Could not export invoice registry.");
        const payload = (await response.json()) as AdminInvoiceRegistryPayload;
        allRows.push(...payload.rows);
        if (!payload.pagination.has_next_page) break;
        exportPage += 1;
      }

      const header = [
        "Reference",
        "Type",
        "Origin",
        "Customer",
        "Email",
        "Total",
        "Paid",
        "Balance",
        "Status",
        "Payment source",
        "Zoho number",
        "Zoho status",
      ];
      const escape = (value: unknown) => {
        const str = String(value ?? "");
        return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
      };
      const lines = [
        header.join(","),
        ...allRows.map((row) =>
          [
            row.reference,
            kindLabel(row.kind),
            originLabel(row.origin),
            row.customer_name,
            row.customer_email,
            (row.amount_cents / 100).toFixed(2),
            (row.amount_paid_cents / 100).toFixed(2),
            (row.balance_cents / 100).toFixed(2),
            statusLabel(row),
            row.payment_source,
            row.zoho_number ?? "",
            row.zoho_status ?? "",
          ]
            .map(escape)
            .join(","),
        ),
      ];

      const blob = new Blob(["\uFEFF", lines.join("\n")], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `invoice-registry-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="min-w-0 max-w-full space-y-5 overflow-x-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500 sm:hidden">
            All invoices and quotes in one place.
          </p>
          <p className="mt-1 hidden max-w-3xl text-sm text-slate-500 sm:block">
            One registry for website bookings, admin bookings, monthly billing, sales invoices and quotes.
            Each document keeps its native financial lifecycle and detail page.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 shadow-sm hover:bg-slate-50"
            aria-label="Refresh invoices"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
          <button
            type="button"
            disabled={exporting}
            onClick={() => void exportRegistry()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Exporting…" : "Export"}
          </button>
        </div>
      </div>

      {error || actionError ? (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{actionError ?? error}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-6">
        <SummaryCard label="Invoices" value={loading ? "—" : summary?.invoice_count ?? 0} />
        <SummaryCard label="Quotes" value={loading ? "—" : summary?.quote_count ?? 0} />
        <SummaryCard label="Paid" value={loading ? "—" : summary?.paid_count ?? 0} />
        <SummaryCard label="Overdue" value={loading ? "—" : summary?.overdue_count ?? 0} />
        <SummaryCard
          label="Outstanding"
          value={loading ? "—" : zar(summary?.outstanding_cents ?? 0)}
          hint="Invoices only"
        />
        <SummaryCard
          label="Missing Zoho"
          value={loading ? "—" : summary?.missing_zoho_count ?? 0}
          hint="Sync-eligible documents"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="space-y-3 border-b border-slate-100 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reference, customer, email, type or origin…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm outline-none focus:border-blue-300"
            />
          </div>

          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {KIND_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setKind(tab.key)}
                className={cn(
                  "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold",
                  kind === tab.key
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatus(tab.key)}
                className={cn(
                  "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold",
                  status === tab.key
                    ? "bg-blue-600 text-white"
                    : "bg-blue-50 text-blue-700 hover:bg-blue-100",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="md:hidden">
          {loading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-36 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-slate-400">No documents found.</p>
          ) : (
            rows.map((row) => (
              <RegistryCard
                key={row.registry_id}
                row={row}
                syncing={syncingId === row.registry_id}
                onSync={(target) => void syncToZoho(target)}
              />
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1120px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                {[
                  "Reference",
                  "Type / Origin",
                  "Customer",
                  "Total",
                  "Paid",
                  "Balance",
                  "Payment",
                  "Status",
                  "Zoho",
                  "",
                ].map((heading) => (
                  <th
                    key={heading}
                    className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={10} className="px-4 py-3">
                      <div className="h-6 animate-pulse rounded-lg bg-slate-100" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-sm text-slate-400">
                    No documents found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.registry_id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-blue-700">
                      {row.reference}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-700">{kindLabel(row.kind)}</p>
                      <p className="text-xs text-slate-400">{originLabel(row.origin)}</p>
                    </td>
                    <td className="max-w-[220px] px-4 py-3">
                      <p className="truncate font-medium text-slate-800">{row.customer_name}</p>
                      <p className="truncate text-xs text-slate-400">{row.customer_email || "—"}</p>
                    </td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-slate-800">
                      {zar(row.amount_cents)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-emerald-700">
                      {zar(row.amount_paid_cents)}
                    </td>
                    <td className={cn("px-4 py-3 tabular-nums", row.balance_cents > 0 ? "font-semibold text-orange-700" : "text-slate-500")}>
                      {zar(row.balance_cents)}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-600">
                      {row.payment_source}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold capitalize", statusClass(row))}>
                        {statusLabel(row)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ZohoState row={row} />
                    </td>
                    <td className="px-4 py-3">
                      <RegistryActions
                        row={row}
                        syncing={syncingId === row.registry_id}
                        onSync={(target) => void syncToZoho(target)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-400">
            {loading
              ? "Loading…"
              : pagination.total_filtered === 0
                ? "No documents"
                : `Showing ${pagination.from}–${pagination.to} of ${pagination.total_filtered} documents`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-500">
              Rows
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700"
              >
                {[25, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-xs font-medium text-slate-500">
              Page {pagination.page} of {pagination.total_pages}
            </span>
            <button
              type="button"
              disabled={loading || !pagination.has_previous_page}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </button>
            <button
              type="button"
              disabled={loading || !pagination.has_next_page}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-40"
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
