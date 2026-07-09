"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Plus,
  Printer,
  RefreshCw,
  Search,
  XCircle,
  Pencil,
  Trash2,
  Paperclip,
  AlertCircle,
  Wallet,
  Calendar,
  TrendingDown,
  Clock,
  CheckCircle,
  BarChart3,
} from "lucide-react";
import {
  OfficeZohoMetricCard,
  OfficeZohoMetricsRow,
  OfficeZohoPageHeader,
  OfficeZohoPrimaryButton,
  OfficeZohoSecondaryButton,
  OfficeZohoTableShell,
} from "@/components/admin/office/OfficeZohoChrome";
import { ExpenseFormPanel } from "@/components/admin/expenses/ExpenseFormPanel";
import { ReceiptPreviewModal } from "@/components/admin/expenses/ReceiptPreviewModal";
import { useAdminData, adminFetch } from "@/hooks/useAdminData";
import { confirm, showToast, prompt } from "@/components/ui/notifications";
import type { ExpenseListItem, ExpenseSummary } from "@/lib/admin/expenses/types";
import { EXPENSE_PAYMENT_METHOD_LABELS, EXPENSE_STATUS_LABELS } from "@/lib/admin/expenses/types";
import {
  downloadExpensesCsv,
  downloadExpensesExcel,
  printExpensesTable,
} from "@/lib/admin/expenses/exportExpenses";
import { cn } from "@/lib/utils";

type ExpensesResponse = {
  items: ExpenseListItem[];
  total: number;
  summary: ExpenseSummary;
};

const STATUS_CLS: Record<string, string> = {
  pending: "bg-orange-100 text-orange-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

function formatZar(cents: number): string {
  return `R ${Math.round(cents / 100).toLocaleString("en-ZA")}`;
}

export default function ExpensesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<ExpenseListItem | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);

  const params = useMemo(() => {
    const p: Record<string, string> = {
      page: String(page),
      page_size: String(pageSize),
      sort_by: "expense_date",
      sort_dir: "desc",
    };
    if (search) p.search = search;
    if (statusFilter) p.status = statusFilter;
    if (categoryFilter) p.category_id = categoryFilter;
    if (branchFilter) p.branch_id = branchFilter;
    if (paymentFilter) p.payment_method = paymentFilter;
    if (fromDate) p.from = fromDate;
    if (toDate) p.to = toDate;
    return p;
  }, [search, statusFilter, categoryFilter, branchFilter, paymentFilter, fromDate, toDate, page]);

  const { data, loading, error, refetch } = useAdminData<ExpensesResponse>("/api/admin/expenses", { params });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const summary = data?.summary;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) map.set(item.category_id, `${item.category_group} › ${item.category_name}`);
    return [...map.entries()];
  }, [items]);

  const branches = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) map.set(item.branch_id, item.branch_name);
    return [...map.entries()];
  }, [items]);

  async function handleApprove(id: string) {
    const ok = await confirm({ title: "Approve expense?", description: "It will affect profit calculations." });
    if (!ok) return;
    try {
      const res = await adminFetch(`/api/admin/expenses/${id}/approve`, { method: "POST" });
      if (!res.ok) throw new Error(res.error ?? "Failed.");
      showToast("Expense approved.", "success");
      refetch();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed.", "error");
    }
  }

  async function handleReject(id: string) {
    const reason = await prompt({ title: "Rejection reason", description: "Explain why this expense is being rejected.", placeholder: "Reason…" });
    if (!reason?.trim()) return;
    try {
      const res = await adminFetch(`/api/admin/expenses/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ rejection_reason: reason.trim() }),
      });
      if (!res.ok) throw new Error(res.error ?? "Failed.");
      showToast("Expense rejected.", "success");
      refetch();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed.", "error");
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm({ title: "Delete expense?", description: "This cannot be undone.", confirmLabel: "Delete" });
    if (!ok) return;
    try {
      const res = await adminFetch(`/api/admin/expenses/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(res.error ?? "Failed.");
      showToast("Expense deleted.", "success");
      refetch();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed.", "error");
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <OfficeZohoPageHeader
        title="Expenses"
        subtitle="Track operating expenses, approvals, and receipts"
        actions={
          <>
            <Link href="/office/expense-vendors">
              <OfficeZohoSecondaryButton>Vendors</OfficeZohoSecondaryButton>
            </Link>
            <OfficeZohoSecondaryButton onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </OfficeZohoSecondaryButton>
            <OfficeZohoPrimaryButton
              onClick={() => {
                setEditItem(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              New expense
            </OfficeZohoPrimaryButton>
          </>
        }
      />

      <OfficeZohoMetricsRow>
        <OfficeZohoMetricCard icon={Wallet} label="Total expenses" value={loading ? "—" : formatZar(summary?.total_expenses_cents ?? 0)} />
        <OfficeZohoMetricCard icon={Calendar} label="Today" value={loading ? "—" : formatZar(summary?.today_expenses_cents ?? 0)} />
        <OfficeZohoMetricCard icon={BarChart3} label="This month" value={loading ? "—" : formatZar(summary?.month_expenses_cents ?? 0)} />
        <OfficeZohoMetricCard icon={Clock} label="Pending approval" value={loading ? "—" : `${summary?.pending_count ?? 0}`} />
        <OfficeZohoMetricCard icon={CheckCircle} label="Approved" value={loading ? "—" : formatZar(summary?.approved_cents ?? 0)} />
        <OfficeZohoMetricCard icon={TrendingDown} label="Avg daily spend" value={loading ? "—" : formatZar(summary?.avg_daily_spend_cents ?? 0)} />
      </OfficeZohoMetricsRow>

      <OfficeZohoTableShell>
        <div className="space-y-3 border-b border-slate-200 bg-slate-50/40 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search description or notes…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full rounded-md border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm"
              />
            </div>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="">All categories</option>
              {categories.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
            <select value={branchFilter} onChange={(e) => { setBranchFilter(e.target.value); setPage(1); }} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="">All branches</option>
              {branches.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
            <select value={paymentFilter} onChange={(e) => { setPaymentFilter(e.target.value); setPage(1); }} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="">All payment methods</option>
              {Object.entries(EXPENSE_PAYMENT_METHOD_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" />
            <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-wrap gap-2">
            <OfficeZohoSecondaryButton onClick={() => downloadExpensesCsv(items)}>
              <Download className="h-4 w-4" /> CSV
            </OfficeZohoSecondaryButton>
            <OfficeZohoSecondaryButton onClick={() => downloadExpensesExcel(items)}>
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </OfficeZohoSecondaryButton>
            <OfficeZohoSecondaryButton onClick={() => printExpensesTable(items)}>
              <Printer className="h-4 w-4" /> Print
            </OfficeZohoSecondaryButton>
          </div>
        </div>

        {error ? (
          <div className="flex items-center gap-2 p-6 text-sm text-red-600">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-white text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Created by</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} className="px-4 py-12 text-center text-slate-400">Loading…</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-12 text-center text-slate-400">No expenses found.</td></tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-700">{item.expense_date}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-slate-400">{item.category_group}</span>
                        <br />
                        <span className="text-slate-700">{item.category_name}</span>
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-slate-700">{item.description}</td>
                      <td className="px-4 py-3 text-slate-600">{item.vendor_name ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                        {formatZar(item.amount_cents)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{EXPENSE_PAYMENT_METHOD_LABELS[item.payment_method]}</td>
                      <td className="px-4 py-3">
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_CLS[item.status])}>
                          {EXPENSE_STATUS_LABELS[item.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{item.branch_name}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{item.created_by_email ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {item.receipt_path ? (
                            <button type="button" onClick={() => setReceiptId(item.id)} className="rounded p-1 text-slate-400 hover:bg-slate-100" title="View receipt">
                              <Paperclip className="h-4 w-4" />
                            </button>
                          ) : null}
                          {item.status === "pending" ? (
                            <>
                              <button type="button" onClick={() => handleApprove(item.id)} className="rounded p-1 text-emerald-600 hover:bg-emerald-50" title="Approve">
                                <CheckCircle2 className="h-4 w-4" />
                              </button>
                              <button type="button" onClick={() => handleReject(item.id)} className="rounded p-1 text-red-500 hover:bg-red-50" title="Reject">
                                <XCircle className="h-4 w-4" />
                              </button>
                            </>
                          ) : null}
                          <button type="button" onClick={() => { setEditItem(item); setFormOpen(true); }} className="rounded p-1 text-slate-400 hover:bg-slate-100" title="Edit">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => handleDelete(item.id)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500" title="Delete">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
          <span>{total} expense{total === 1 ? "" : "s"}</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border border-slate-200 p-1.5 disabled:opacity-40">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="tabular-nums">Page {page} of {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded border border-slate-200 p-1.5 disabled:opacity-40">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </OfficeZohoTableShell>

      <ExpenseFormPanel open={formOpen} onClose={() => { setFormOpen(false); setEditItem(null); }} onSaved={refetch} editItem={editItem} />
      <ReceiptPreviewModal expenseId={receiptId ?? ""} open={Boolean(receiptId)} onClose={() => setReceiptId(null)} />
    </div>
  );
}
