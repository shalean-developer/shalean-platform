"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Plus, RefreshCw } from "lucide-react";
import type {
  AdminBillingDocumentKind,
  AdminBillingDocumentRow,
  AdminBillingDocumentsSummary,
} from "@/lib/admin/billing/loadAdminBillingDocuments";
import { monthlyInvoiceZohoSyncErrorMessage } from "@/lib/monthlyInvoice/resolveMonthlyInvoiceZohoTotalCents";
import { salesDocumentIsEditableWithoutPayment } from "@/lib/salesDocument/types";
import { adminFetch } from "@/hooks/useAdminData";
import { cn } from "@/lib/utils";

type FilterTab = "all" | "missing_zoho" | "quote" | "sales_invoice" | "booking_invoice";

const TAB_QUERY_VALUES = new Set<FilterTab>(["all", "missing_zoho", "quote", "sales_invoice", "booking_invoice"]);

function parseTabParam(value: string | null): FilterTab {
  if (value && TAB_QUERY_VALUES.has(value as FilterTab)) return value as FilterTab;
  return "missing_zoho";
}

function formatZar(cents: number) {
  if (cents <= 0) return "—";
  return `R ${(cents / 100).toLocaleString("en-ZA")}`;
}

function kindLabel(kind: AdminBillingDocumentKind) {
  switch (kind) {
    case "quote":
      return "Quote";
    case "sales_invoice":
      return "Sales invoice";
    case "booking_invoice":
      return "Booking";
    case "monthly_invoice":
      return "Monthly";
    default:
      return kind;
  }
}

function statusCls(status: string) {
  const s = status.toLowerCase();
  if (s === "requested") return "bg-amber-100 text-amber-800";
  if (s === "paid") return "bg-emerald-100 text-emerald-700";
  if (s === "sent") return "bg-blue-100 text-blue-700";
  if (s === "draft") return "bg-slate-100 text-slate-600";
  return "bg-orange-100 text-orange-700";
}

function SummaryCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "warn" | "ok";
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-bold tabular-nums",
          tone === "warn" ? "text-amber-700" : tone === "ok" ? "text-emerald-700" : "text-slate-900",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function ZohoBadge({ linked }: { linked: boolean }) {
  if (linked) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
        <CheckCircle2 className="h-3 w-3" /> In Zoho
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
      <AlertCircle className="h-3 w-3" /> Missing
    </span>
  );
}

function canManualSync(doc: AdminBillingDocumentRow): boolean {
  if (doc.zoho_linked) return false;
  if (doc.amount_cents <= 0) return false;
  if (doc.status === "requested") return false;
  return true;
}

function canEditBillingDocument(doc: AdminBillingDocumentRow): boolean {
  if (doc.kind !== "quote" && doc.kind !== "sales_invoice") return false;
  return salesDocumentIsEditableWithoutPayment({
    document_type: doc.kind === "quote" ? "quote" : "invoice",
    status: doc.status,
    amount_paid_cents: doc.amount_paid_cents ?? 0,
  });
}

function BillingDocumentRow({
  doc,
  syncing,
  onSync,
}: {
  doc: AdminBillingDocumentRow;
  syncing: boolean;
  onSync: (doc: AdminBillingDocumentRow) => void;
}) {
  const showSync = canManualSync(doc);
  const showEdit = canEditBillingDocument(doc);

  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50/50">
      <td className="px-4 py-3 font-mono text-xs text-blue-600">{doc.id.slice(0, 8).toUpperCase()}</td>
      <td className="px-4 py-3">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
          {kindLabel(doc.kind)}
        </span>
      </td>
      <td className="px-4 py-3">
        <p className="font-medium text-slate-800">{doc.customer_name || "—"}</p>
        <p className="text-xs text-slate-400">{doc.customer_email || "—"}</p>
        {doc.source === "customer_request" ? (
          <p className="mt-0.5 text-xs font-medium text-amber-700">Website request</p>
        ) : null}
      </td>
      <td className="px-4 py-3 tabular-nums">{formatZar(doc.amount_cents)}</td>
      <td className="px-4 py-3">
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold capitalize", statusCls(doc.status))}>
          {doc.status.replace(/_/g, " ")}
        </span>
      </td>
      <td className="px-4 py-3">
        <ZohoBadge linked={doc.zoho_linked} />
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-3">
          {showSync ? (
            <button
              type="button"
              disabled={syncing}
              onClick={() => onSync(doc)}
              className="text-sm font-medium text-amber-700 hover:underline disabled:opacity-50"
            >
              {syncing ? "Syncing…" : "Sync to Zoho"}
            </button>
          ) : null}
          {showEdit ? (
            <Link href={doc.href} className="text-sm font-medium text-violet-700 hover:underline">
              Edit
            </Link>
          ) : null}
          <Link href={doc.href} className="text-sm font-medium text-blue-600 hover:underline">
            Open
          </Link>
        </div>
      </td>
    </tr>
  );
}

export default function OfficeBillingPage() {
  const searchParams = useSearchParams();
  const initialTab = parseTabParam(searchParams.get("tab"));
  const [docs, setDocs] = useState<AdminBillingDocumentRow[]>([]);
  const [summary, setSummary] = useState<AdminBillingDocumentsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<FilterTab>(initialTab);  const [syncingKey, setSyncingKey] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (tab !== "all") params.set("kind", tab);
      const res = await adminFetch<{ documents: AdminBillingDocumentRow[]; summary: AdminBillingDocumentsSummary }>(
        `/api/admin/billing-documents?${params.toString()}`,
      );
      if (!res.ok) {
        setDocs([]);
        setSummary(null);
        return;
      }
      setDocs(res.data?.documents ?? []);
      setSummary(res.data?.summary ?? null);
    } catch {
      setDocs([]);
      setSummary(null);
    }
    setLoading(false);
  }, [q, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const nextTab = parseTabParam(searchParams.get("tab"));
    setTab((current) => (current === nextTab ? current : nextTab));
  }, [searchParams]);
  const syncDocument = useCallback(
    async (doc: AdminBillingDocumentRow) => {
      const key = `${doc.kind}:${doc.id}`;
      setSyncingKey(key);
      setSyncError(null);
      setSyncSuccess(null);
      try {
        const res = await adminFetch<{ ok?: boolean; zoho_id?: string; error?: string }>(
          "/api/admin/billing-documents/sync",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind: doc.kind, id: doc.id }),
          },
        );
        if (!res.ok || !res.data?.ok) {
          const raw = res.data?.error ?? res.error ?? "Sync failed.";
          setSyncError(monthlyInvoiceZohoSyncErrorMessage(raw));
          return;
        }
        setSyncSuccess(`Linked in Zoho (${res.data.zoho_id?.slice(-8) ?? "ok"}).`);
        await load();
      } catch {
        setSyncError("Sync failed.");
      } finally {
        setSyncingKey(null);
      }
    },
    [load],
  );

  const tabs = useMemo(
    () =>
      [
        ["missing_zoho", `Needs sync${summary?.missing_zoho ? ` (${summary.missing_zoho})` : ""}`],
        ["all", "All documents"],
        ["quote", "Quotes"],
        ["sales_invoice", "Sales invoices"],
        ["booking_invoice", "Booking invoices"],
      ] as const,
    [summary?.missing_zoho],
  );

  const missingMonthly = summary?.by_kind.monthly_invoice.missing_zoho ?? 0;
  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Zoho sync</h1>
          <p className="text-sm text-slate-500">
            Accounting integration inbox — find documents missing in Zoho and sync them. Day-to-day invoice collection
            lives on{" "}
            <Link href="/office/invoices" className="font-medium text-blue-600 hover:underline">
              Monthly invoices
            </Link>
            .
          </p>
        </div>
        <Link
          href="/office/sales-documents/create"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto"
        >
          <Plus className="h-4 w-4" /> New quote or invoice
        </Link>
      </div>

      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Needs Zoho sync"
            value={summary.missing_zoho}
            tone={summary.missing_zoho > 0 ? "warn" : "ok"}
            hint="Priced documents without a Zoho estimate or invoice"
          />
          <SummaryCard label="Linked in Zoho" value={summary.zoho_linked} tone="ok" />
          <SummaryCard label="Documents tracked" value={summary.total} />
          <SummaryCard
            label="Monthly invoices missing"
            value={missingMonthly}
            tone={missingMonthly > 0 ? "warn" : "ok"}
            hint={
              missingMonthly > 0
                ? "Open each invoice on Monthly invoices and use Sync to Zoho"
                : "All monthly invoices linked"
            }
          />
        </div>
      ) : null}

      {missingMonthly > 0 ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <p className="font-semibold">
            {missingMonthly} monthly invoice{missingMonthly === 1 ? "" : "s"} need Zoho sync
          </p>
          <p className="mt-1 text-blue-800">
            Manage and sync them from{" "}
            <Link href="/office/invoices" className="font-medium underline hover:text-blue-900">
              Monthly invoices
            </Link>{" "}
            — open an invoice and use <strong>Sync to Zoho</strong>. They also appear in the <strong>Needs sync</strong>{" "}
            tab here.
          </p>
        </div>
      ) : null}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {tabs.map(([key, label]) => (
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

      {syncError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{syncError}</div>
      ) : null}
      {syncSuccess ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {syncSuccess}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Zoho</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : docs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    {tab === "missing_zoho"
                      ? "All documents are linked in Zoho."
                      : "No documents match this filter."}
                  </td>
                </tr>              ) : (
                docs.map((d) => (
                  <BillingDocumentRow
                    key={`${d.kind}-${d.id}`}
                    doc={d}
                    syncing={syncingKey === `${d.kind}:${d.id}`}
                    onSync={syncDocument}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {summary && summary.missing_zoho > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">{summary.missing_zoho} document(s) still missing a Zoho link</p>
          <p className="mt-1 text-amber-800">
            Use <strong>Sync to Zoho</strong> on each row, or open the record to fix customer contact details first.
            Quote requests must be priced before they can sync.
          </p>
        </div>
      ) : null}
    </div>
  );
}
