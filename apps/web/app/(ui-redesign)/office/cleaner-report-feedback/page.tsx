"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, RefreshCw, AlertCircle, Loader2, ChevronLeft, ChevronRight, Shield, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { showToast } from "@/components/ui/notifications";
import { useAdminData } from "@/hooks/useAdminData";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

const DEFAULT_PAGE_SIZE = 15;
const PAGE_SIZE_OPTIONS = [10, 15, 25, 50] as const;

type SubmissionRow = {
  id: string;
  submission_type: "report" | "feedback";
  subject: string | null;
  message: string;
  status: string;
  admin_response?: string | null;
  created_at: string;
  resolved_at?: string | null;
  reporter_label: string;
  reporter_phone: string | null;
  cleaner_id: string | null;
};

type TabKey = "all" | "report" | "feedback";
type StatusTab = "all" | "open" | "reviewing" | "resolved" | "closed";

type Payload = {
  submissions: SubmissionRow[];
  statusCounts?: { open: number; reviewing: number; resolved: number; closed: number };
  meta?: { limit: number; returned: number };
};

const STATUS_UI: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-red-100 text-red-700" },
  reviewing: { label: "Under Review", cls: "bg-orange-100 text-orange-700" },
  resolved: { label: "Resolved", cls: "bg-emerald-100 text-emerald-700" },
  closed: { label: "Closed", cls: "bg-slate-100 text-slate-600" },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

export default function CleanerReportFeedbackPage() {
  const [search, setSearch] = useState("");
  const [typeTab, setTypeTab] = useState<TabKey>("all");
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selected, setSelected] = useState<SubmissionRow | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data, loading, error, refetch } = useAdminData<Payload>("/api/admin/cleaner-report-feedback", {
    params: { limit: "200" },
  });

  const submissions = data?.submissions ?? [];

  const getToken = useCallback(async () => {
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) throw new Error("Sign in as admin.");
    return token;
  }, []);

  const typeFiltered = useMemo(() => {
    if (typeTab === "all") return submissions;
    return submissions.filter((s) => s.submission_type === typeTab);
  }, [submissions, typeTab]);

  const statusFiltered = useMemo(() => {
    if (statusTab === "all") return typeFiltered;
    return typeFiltered.filter((s) => s.status === statusTab);
  }, [typeFiltered, statusTab]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return statusFiltered;
    return statusFiltered.filter(
      (s) =>
        s.reporter_label.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        (s.subject ?? "").toLowerCase().includes(q) ||
        s.message.toLowerCase().includes(q),
    );
  }, [statusFiltered, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageFrom = filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const pageTo = Math.min(safePage * pageSize, filtered.length);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, typeTab, statusTab, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const counts = useMemo(() => {
    const fromApi = data?.statusCounts;
    if (fromApi) return fromApi;
    return {
      open: submissions.filter((s) => s.status === "open").length,
      reviewing: submissions.filter((s) => s.status === "reviewing").length,
      resolved: submissions.filter((s) => s.status === "resolved").length,
      closed: submissions.filter((s) => s.status === "closed").length,
    };
  }, [data?.statusCounts, submissions]);

  const patch = async (status: "reviewing" | "resolved" | "closed") => {
    if (!selected) return;
    setBusy(status);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/cleaner-report-feedback/${encodeURIComponent(selected.id)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status, admin_response: note }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      showToast("Submission updated.", "success");
      setSelected(null);
      setNote("");
      await refetch();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Update failed", "error");
    } finally {
      setBusy(null);
    }
  };

  const openManage = (row: SubmissionRow) => {
    setSelected(row);
    setNote(row.admin_response ?? "");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cleaner Reports &amp; Feedback</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Anonymous reports and identifiable feedback from cleaners.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm hover:bg-slate-50"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Refresh
        </button>
      </div>

      {error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Open", count: counts.open, color: "text-red-600" },
          { label: "Under Review", count: counts.reviewing, color: "text-orange-600" },
          { label: "Resolved", count: counts.resolved, color: "text-emerald-600" },
          { label: "Closed", count: counts.closed, color: "text-slate-600" },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", k.color)}>{loading ? "—" : k.count}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Search submissions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm placeholder:text-slate-400 focus:border-blue-300 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {(["all", "report", "feedback"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setTypeTab(s)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  typeTab === s ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100",
                )}
              >
                {s === "report" ? <Shield className="h-3 w-3" /> : null}
                {s === "feedback" ? <MessageSquare className="h-3 w-3" /> : null}
                {s === "all" ? "All types" : s === "report" ? "Reports" : "Feedback"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {(["all", "open", "reviewing", "resolved", "closed"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusTab(s)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  statusTab === s ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-100",
                )}
              >
                {s === "all" ? "All status" : (STATUS_UI[s]?.label ?? s)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading submissions…
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">No submissions match this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  {["Type", "From", "Topic", "Message", "Submitted", "Status", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pageRows.map((row) => {
                  const s = STATUS_UI[row.status] ?? { label: row.status, cls: "bg-slate-100 text-slate-600" };
                  const isReport = row.submission_type === "report";
                  return (
                    <tr key={row.id} className={cn("hover:bg-slate-50/50", selected?.id === row.id && "bg-blue-50/60")}>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold",
                            isReport ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700",
                          )}
                        >
                          {isReport ? <Shield className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
                          {isReport ? "Report" : "Feedback"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{row.reporter_label}</p>
                        {!isReport && row.reporter_phone ? (
                          <p className="text-[10px] text-slate-400">{row.reporter_phone}</p>
                        ) : null}
                        {!isReport && row.cleaner_id ? (
                          <Link
                            href={`/office/cleaners?highlight=${row.cleaner_id}`}
                            className="text-[10px] text-blue-600 hover:underline"
                          >
                            View cleaner
                          </Link>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{row.subject ?? "—"}</td>
                      <td className="max-w-[220px] truncate px-4 py-3 text-xs text-slate-500" title={row.message}>
                        {row.message}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">{formatDate(row.created_at)}</td>
                      <td className="px-4 py-3">
                        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", s.cls)}>{s.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => openManage(row)}
                          className="text-xs font-bold text-blue-600 hover:underline"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtered.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-400">
              Showing {pageFrom}–{pageTo} of {filtered.length}
            </p>
            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" /> Prev
              </button>
              <span className="text-xs font-medium text-slate-500">
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {selected.submission_type === "report" ? "Anonymous report" : "Cleaner feedback"}
                </p>
                <h2 className="text-lg font-bold text-slate-900">{selected.reporter_label}</h2>
                {selected.submission_type === "feedback" && selected.reporter_phone ? (
                  <p className="text-sm text-slate-500">{selected.reporter_phone}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-sm font-semibold text-slate-500 hover:text-slate-800"
              >
                Close
              </button>
            </div>

            {selected.subject ? (
              <p className="mt-3 text-sm font-medium text-slate-700">Topic: {selected.subject}</p>
            ) : null}
            <p className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
              {selected.message}
            </p>

            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              Admin notes / response
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:outline-none"
              placeholder="Required when resolving or closing"
            />

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy != null}
                onClick={() => void patch("reviewing")}
                className="rounded-xl bg-orange-600 px-3 py-2 text-xs font-bold text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {busy === "reviewing" ? "Saving…" : "Mark reviewing"}
              </button>
              <button
                type="button"
                disabled={busy != null || note.trim().length < 1}
                onClick={() => void patch("resolved")}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy === "resolved" ? "Saving…" : "Resolve"}
              </button>
              <button
                type="button"
                disabled={busy != null || note.trim().length < 1}
                onClick={() => void patch("closed")}
                className="rounded-xl bg-slate-700 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {busy === "closed" ? "Saving…" : "Close"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
