"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, RefreshCw, AlertCircle, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { showToast } from "@/components/ui/notifications";
import { useAdminData } from "@/hooks/useAdminData";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

const DEFAULT_PAGE_SIZE = 15;
const PAGE_SIZE_OPTIONS = [10, 15, 25, 50] as const;

type DisputeRow = {
  id: string;
  cleaner_id: string;
  booking_id: string;
  reason: string;
  status: string;
  admin_response?: string | null;
  created_at: string;
  cleaner_name: string;
  booking: { date: string | null; service: string | null } | null;
};

type TabKey = "all" | "open" | "reviewing" | "rejected" | "resolved";

type DisputesPayload = {
  disputes: DisputeRow[];
  statusCounts?: {
    open: number;
    reviewing: number;
    resolved: number;
    rejected: number;
  };
  meta?: { limit: number; returned: number };
};

const STATUS_UI: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-red-100 text-red-700" },
  reviewing: { label: "Under Review", cls: "bg-orange-100 text-orange-700" },
  resolved: { label: "Resolved", cls: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rejected", cls: "bg-violet-100 text-violet-700" },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

export default function DisputesPage() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabKey>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selected, setSelected] = useState<DisputeRow | null>(null);
  const [note, setNote] = useState("");
  const [adjCents, setAdjCents] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data, loading, error, refetch } = useAdminData<DisputesPayload>("/api/admin/cleaner-earnings-disputes", {
    params: { limit: "200" },
  });

  const disputes = data?.disputes ?? [];

  const getToken = useCallback(async () => {
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) throw new Error("Sign in as admin.");
    return token;
  }, []);

  const tabFiltered = useMemo(() => {
    if (tab === "all") return disputes;
    return disputes.filter((d) => d.status === tab);
  }, [disputes, tab]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tabFiltered;
    return tabFiltered.filter(
      (d) =>
        d.cleaner_name.toLowerCase().includes(q) ||
        d.id.toLowerCase().includes(q) ||
        d.booking_id.toLowerCase().includes(q) ||
        d.reason.toLowerCase().includes(q),
    );
  }, [tabFiltered, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageFrom = filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const pageTo = Math.min(safePage * pageSize, filtered.length);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, tab, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);


  const counts = useMemo(() => {
    const fromApi = data?.statusCounts;
    if (fromApi) return fromApi;
    return {
      open: disputes.filter((d) => d.status === "open").length,
      reviewing: disputes.filter((d) => d.status === "reviewing").length,
      rejected: disputes.filter((d) => d.status === "rejected").length,
      resolved: disputes.filter((d) => d.status === "resolved").length,
    };
  }, [data?.statusCounts, disputes]);

  const patch = async (status: "reviewing" | "resolved" | "rejected") => {
    if (!selected) return;
    setBusy(status);
    try {
      const token = await getToken();
      const body: Record<string, unknown> = { status, admin_response: note };
      if (status === "resolved" && adjCents.trim()) {
        const n = Number(adjCents.trim());
        if (Number.isFinite(n) && Math.round(n) !== 0) {
          body.adjustment_amount_cents = Math.round(n);
          body.adjustment_reason = adjReason.trim() || "Manual adjustment";
        }
      }
      const res = await fetch(`/api/admin/cleaner-earnings-disputes/${encodeURIComponent(selected.id)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      showToast("Dispute updated.", "success");
      setSelected(null);
      setNote("");
      setAdjCents("");
      setAdjReason("");
      await refetch();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Update failed", "error");
    } finally {
      setBusy(null);
    }
  };

  const openManage = (d: DisputeRow) => {
    setSelected(d);
    setNote(d.admin_response ?? "");
    setAdjCents("");
    setAdjReason("");
  };

  const truncatedNote =
    data?.meta && data.meta.returned >= data.meta.limit ? (
      <p className="text-xs text-amber-700">
        Showing the {data.meta.returned} most recent disputes. Older rows are not listed here — use status filters or admin search for full history.
      </p>
    ) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Earnings Disputes</h1>
          <p className="mt-0.5 text-sm text-slate-500">Review and resolve cleaner payout and earnings issues.</p>
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

      {truncatedNote}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Open", count: counts.open, color: "text-red-600" },
          { label: "Under Review", count: counts.reviewing, color: "text-orange-600" },
          { label: "Rejected", count: counts.rejected, color: "text-violet-600" },
          { label: "Resolved", count: counts.resolved, color: "text-emerald-600" },
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
              placeholder="Search disputes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm placeholder:text-slate-400 focus:border-blue-300 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {(["all", "open", "reviewing", "rejected", "resolved"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setTab(s)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  tab === s ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100",
                )}
              >
                {s === "all" ? "All" : (STATUS_UI[s]?.label ?? s)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading disputes…
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">No disputes match this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  {["ID", "Cleaner", "Booking", "Reason", "Submitted", "Status", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pageRows.map((d) => {
                  const s = STATUS_UI[d.status] ?? { label: d.status, cls: "bg-slate-100 text-slate-600" };
                  return (
                    <tr key={d.id} className={cn("hover:bg-slate-50/50", selected?.id === d.id && "bg-blue-50/60")}>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-blue-600">{d.id.slice(0, 8)}…</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{d.cleaner_name}</td>
                      <td className="px-4 py-3">
                        <Link href={`/office/bookings/${d.booking_id}`} className="font-mono text-xs text-blue-600 hover:underline">
                          {d.booking_id.slice(0, 8)}…
                        </Link>
                        {d.booking?.service ? <p className="text-[10px] text-slate-400">{d.booking.service}</p> : null}
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-xs text-slate-500" title={d.reason}>
                        {d.reason}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">{formatDate(d.created_at)}</td>
                      <td className="px-4 py-3">
                        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", s.cls)}>{s.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => openManage(d)}
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
              Showing {pageFrom}–{pageTo} of {filtered.length} dispute{filtered.length === 1 ? "" : "s"}
              {search.trim() ? ` matching “${search.trim()}”` : ""}
            </p>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-500">
                Rows
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
              </label>
              <span className="text-xs font-medium text-slate-500">
                Page {safePage} of {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          onClick={() => (busy ? null : setSelected(null))}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-900">Dispute</h2>
            <p className="mt-1 text-xs text-slate-500">
              {selected.cleaner_name} ·{" "}
              <Link className="text-blue-600 hover:underline" href={`/office/bookings/${selected.booking_id}`}>
                Booking
              </Link>
            </p>
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
              <p className="text-xs font-semibold text-slate-500">Cleaner reason</p>
              <p className="mt-1 whitespace-pre-wrap">{selected.reason}</p>
            </div>
            {selected.admin_response ? (
              <div className="mt-2 text-xs text-slate-600">
                <span className="font-semibold">Last admin note: </span>
                {selected.admin_response}
              </div>
            ) : null}

            <label className="mt-4 block text-xs font-semibold text-slate-700">
              Admin response / note
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder={selected.status === "open" || selected.status === "reviewing" ? "Visible to internal review…" : ""}
              />
            </label>

            {selected.status !== "resolved" && selected.status !== "rejected" ? (
              <div className="mt-4 space-y-2 border-t border-slate-200 pt-4">
                <p className="text-xs font-semibold text-slate-600">Optional when resolving</p>
                <label className="block text-xs text-slate-600">
                  Adjustment (cents, + or −)
                  <input
                    type="number"
                    value={adjCents}
                    onChange={(e) => setAdjCents(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-sm"
                    placeholder="e.g. 5000 or -2500"
                  />
                </label>
                <label className="block text-xs text-slate-600">
                  Adjustment reason
                  <input
                    value={adjReason}
                    onChange={(e) => setAdjReason(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    placeholder="Credit for missed line…"
                  />
                </label>
                <p className="text-[10px] text-slate-500">
                  Creates a row in cleaner earnings adjustments; does not change the original earnings snapshot.
                </p>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              {selected.status === "open" ? (
                <button
                  type="button"
                  disabled={busy != null}
                  onClick={() => void patch("reviewing")}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy === "reviewing" ? "…" : "Mark reviewing"}
                </button>
              ) : null}
              {selected.status !== "resolved" && selected.status !== "rejected" ? (
                <>
                  <button
                    type="button"
                    disabled={busy != null || !note.trim()}
                    onClick={() => void patch("resolved")}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {busy === "resolved" ? "…" : "Resolve"}
                  </button>
                  <button
                    type="button"
                    disabled={busy != null || !note.trim()}
                    onClick={() => void patch("rejected")}
                    className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {busy === "rejected" ? "…" : "Reject"}
                  </button>
                </>
              ) : null}
              <button
                type="button"
                disabled={busy != null}
                onClick={() => setSelected(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
