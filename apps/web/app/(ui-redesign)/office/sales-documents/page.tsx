"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CircleDollarSign, Plus, RefreshCw, Target, TrendingUp, UserRoundSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { adminFetch } from "@/hooks/useAdminData";
import { SalesDocumentDeleteDialog } from "@/components/admin/sales-documents/SalesDocumentDeleteDialog";
import {
  isSalesDocumentEditable,
  SalesDocumentRowActions,
  type SalesDocumentActionRow,
} from "@/components/admin/sales-documents/SalesDocumentRowActions";

type SalesDocRow = SalesDocumentActionRow & {
  source?: string;
  customer_email: string;
  total_cents: number;
  balance_cents: number;
  created_at: string;
  view_count: number;
  first_viewed_at: string | null;
  linked_booking?: { id: string; status: string | null } | null;
};

type PipelineSummary = {
  counts: { lead: number; quote: number; follow_up: number; won: number; lost: number };
  completed_revenue_cents: number;
};

type FilterTab = "all" | "requests" | "quote" | "invoice";

function formatZar(cents: number) {
  return `R ${(cents / 100).toLocaleString("en-ZA")}`;
}

function statusCls(status: string) {
  const s = status.toLowerCase();
  if (s === "requested") return "bg-amber-100 text-amber-800";
  if (s === "paid") return "bg-emerald-100 text-emerald-700";
  if (s === "refunded") return "bg-red-100 text-red-700";
  if (s === "sent") return "bg-blue-100 text-blue-700";
  if (s === "draft") return "bg-slate-100 text-slate-600";
  if (s === "accepted") return "bg-violet-100 text-violet-700";
  return "bg-orange-100 text-orange-700";
}

function statusLabel(status: string) {
  if (status === "requested") return "New request";
  return status.replace(/_/g, " ");
}

function SalesDocumentListItem({
  doc,
  onDelete,
}: {
  doc: SalesDocRow;
  onDelete: (doc: SalesDocRow) => void;
}) {
  return (
    <div className="border-t border-slate-100 px-4 py-4 first:border-t-0 hover:bg-slate-50/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-blue-600">
              {doc.id.slice(0, 8).toUpperCase()}
            </span>
            <span className="text-xs font-medium capitalize text-slate-500">{doc.document_type}</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
                statusCls(doc.status),
              )}
            >
              {statusLabel(doc.status)}
            </span>
            {isSalesDocumentEditable(doc) ? (
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-violet-700">
                Editable
              </span>
            ) : null}
          </div>
          <p className="mt-2 truncate text-sm font-medium text-slate-800">{doc.customer_name}</p>
          <p className="truncate text-xs text-slate-400">{doc.customer_email}</p>
          {doc.source === "customer_request" ? (
            <p className="mt-1 text-xs font-medium text-amber-700">Website request</p>
          ) : null}
          <p className="mt-2 text-sm font-semibold tabular-nums text-slate-800">
            {doc.status === "requested" ? "—" : formatZar(doc.total_cents)}
          </p>
          {doc.view_count > 0 ? (
            <p className="mt-1 text-xs text-slate-400">
              Opened {doc.view_count}×
              {doc.first_viewed_at
                ? ` · ${new Date(doc.first_viewed_at).toLocaleDateString("en-ZA", { dateStyle: "medium" })}`
                : ""}
            </p>
          ) : null}
        </div>
        <SalesDocumentRowActions doc={doc} onDelete={() => onDelete(doc)} layout="stack" />
      </div>
    </div>
  );
}

function SalesDocumentTableRow({
  doc,
  onDelete,
}: {
  doc: SalesDocRow;
  onDelete: (doc: SalesDocRow) => void;
}) {
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50/50">
      <td className="px-4 py-3 font-mono text-xs text-blue-600">{doc.id.slice(0, 8).toUpperCase()}</td>
      <td className="px-4 py-3 capitalize">{doc.document_type}</td>
      <td className="px-4 py-3">
        <p className="font-medium text-slate-800">{doc.customer_name}</p>
        <p className="text-xs text-slate-400">{doc.customer_email}</p>
        {doc.source === "customer_request" ? (
          <p className="mt-0.5 text-xs font-medium text-amber-700">Website request</p>
        ) : null}
      </td>
      <td className="px-4 py-3 tabular-nums">
        {doc.status === "requested" ? "—" : formatZar(doc.total_cents)}
      </td>
      <td className="px-4 py-3">
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold capitalize", statusCls(doc.status))}>
          {statusLabel(doc.status)}
        </span>
        {doc.view_count > 0 ? (
          <p className="mt-1 text-xs text-slate-400">
            Opened {doc.view_count}×
            {doc.first_viewed_at
              ? ` · ${new Date(doc.first_viewed_at).toLocaleDateString("en-ZA", { dateStyle: "medium" })}`
              : ""}
          </p>
        ) : null}
      </td>
      <td className="px-4 py-3 text-right">
        <SalesDocumentRowActions doc={doc} onDelete={() => onDelete(doc)} />
      </td>
    </tr>
  );
}

export default function OfficeSalesDocumentsPage() {
  const [docs, setDocs] = useState<SalesDocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pipeline, setPipeline] = useState<PipelineSummary | null>(null);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<FilterTab>("all");
  const [deleteTarget, setDeleteTarget] = useState<SalesDocRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch<{ documents: SalesDocRow[]; pipeline: PipelineSummary }>(
        `/api/admin/sales-documents?q=${encodeURIComponent(q)}`,
      );
      if (!res.ok) {
        setDocs([]);
        return;
      }
      setDocs(res.data?.documents ?? []);
      setPipeline(res.data?.pipeline ?? null);
    } catch {
      setDocs([]);
    }
    setLoading(false);
  }, [q]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (tab === "all") return docs;
    if (tab === "requests") return docs.filter((d) => d.status === "requested");
    return docs.filter((d) => d.document_type === tab);
  }, [docs, tab]);

  const requestCount = docs.filter((d) => d.status === "requested").length;

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await adminFetch<{ ok?: boolean; error?: string }>(
        `/api/admin/sales-documents/${deleteTarget.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = res.error ?? res.data?.error ?? "Delete failed.";
        if (err === "linked_paid_booking") {
          throw new Error("Cannot delete — a paid booking is linked to this invoice.");
        }
        if (err === "not_deletable") {
          throw new Error("Cannot delete — document is paid or locked.");
        }
        throw new Error(err);
      }
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed.");
    }
    setDeleteBusy(false);
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Leads &amp; sales</h1>
          <p className="text-sm text-slate-500">
            Track each website request through quote, follow-up, won/lost, canonical booking and completed revenue.
          </p>
        </div>
        <Link
          href="/office/sales-documents/create"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto"
        >
          <Plus className="h-4 w-4" /> New document
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {([
          ["Open leads", pipeline ? pipeline.counts.lead + pipeline.counts.quote : "—", UserRoundSearch],
          ["Follow-up", pipeline?.counts.follow_up ?? "—", Target],
          ["Won", pipeline?.counts.won ?? "—", TrendingUp],
          ["Completed revenue", pipeline ? formatZar(pipeline.completed_revenue_cents) : "—", CircleDollarSign],
        ] satisfies Array<[string, string | number, LucideIcon]>).map(([label, value, Icon]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Icon className="h-4 w-4" /> {label}
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {(
          [
            ["all", "All"],
            ["requests", `Requests${requestCount > 0 ? ` (${requestCount})` : ""}`],
            ["quote", "Quotes"],
            ["invoice", "Invoices"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition",
              tab === key ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <input
          type="search"
          placeholder="Search name, email, id…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 sm:w-auto"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {deleteError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {deleteError}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:hidden">
        {loading ? (
          <div className="px-4 py-8 text-center text-slate-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-slate-400">No documents yet.</div>
        ) : (
          filtered.map((d) => (
            <SalesDocumentListItem key={d.id} doc={d} onDelete={(doc) => setDeleteTarget(doc)} />
          ))
        )}
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No documents yet.
                  </td>
                </tr>
              ) : (
                filtered.map((d) => (
                  <SalesDocumentTableRow key={d.id} doc={d} onDelete={(doc) => setDeleteTarget(doc)} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SalesDocumentDeleteDialog
        doc={deleteTarget}
        open={Boolean(deleteTarget)}
        busy={deleteBusy}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
