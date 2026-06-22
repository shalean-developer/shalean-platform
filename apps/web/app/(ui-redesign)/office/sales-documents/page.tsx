"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Plus, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminFetch } from "@/hooks/useAdminData";

type SalesDocRow = {
  id: string;
  document_type: string;
  status: string;
  source?: string;
  customer_name: string;
  customer_email: string;
  total_cents: number;
  balance_cents: number;
  created_at: string;
  view_count: number;
  first_viewed_at: string | null;
};

type FilterTab = "all" | "requests" | "quote" | "invoice";

function formatZar(cents: number) {
  return `R ${(cents / 100).toLocaleString("en-ZA")}`;
}

function statusCls(status: string) {
  const s = status.toLowerCase();
  if (s === "requested") return "bg-amber-100 text-amber-800";
  if (s === "paid") return "bg-emerald-100 text-emerald-700";
  if (s === "sent") return "bg-blue-100 text-blue-700";
  if (s === "draft") return "bg-slate-100 text-slate-600";
  if (s === "accepted") return "bg-violet-100 text-violet-700";
  return "bg-orange-100 text-orange-700";
}

function statusLabel(status: string) {
  if (status === "requested") return "New request";
  return status.replace(/_/g, " ");
}

export default function OfficeSalesDocumentsPage() {
  const [docs, setDocs] = useState<SalesDocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<FilterTab>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch<{ documents: SalesDocRow[] }>(
        `/api/admin/sales-documents?q=${encodeURIComponent(q)}`,
      );
      if (!res.ok) {
        setDocs([]);
        return;
      }
      setDocs(res.data?.documents ?? []);
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

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quotes</h1>
          <p className="text-sm text-slate-500">
            Review customer quote requests, create ad-hoc quotes, and send one-off invoices.
          </p>
        </div>
        <Link
          href="/office/sales-documents/create"
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> New document
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
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
              "rounded-full px-4 py-1.5 text-sm font-medium transition",
              tab === key ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Search name, email, id…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">Loading…</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">No documents yet.</td>
              </tr>
            ) : (
              filtered.map((d) => (
                <tr key={d.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-mono text-xs text-blue-600">{d.id.slice(0, 8).toUpperCase()}</td>
                  <td className="px-4 py-3 capitalize">{d.document_type}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{d.customer_name}</p>
                    <p className="text-xs text-slate-400">{d.customer_email}</p>
                    {d.source === "customer_request" ? (
                      <p className="mt-0.5 text-xs font-medium text-amber-700">Website request</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {d.status === "requested" ? "—" : formatZar(d.total_cents)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold capitalize", statusCls(d.status))}>
                      {statusLabel(d.status)}
                    </span>
                    {d.view_count > 0 ? (
                      <p className="mt-1 text-xs text-slate-400">
                        Opened {d.view_count}×
                        {d.first_viewed_at
                          ? ` · ${new Date(d.first_viewed_at).toLocaleDateString("en-ZA", { dateStyle: "medium" })}`
                          : ""}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/office/sales-documents/${d.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                      {d.status === "requested" ? "Review" : "View"}
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
