"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

type DisputeRow = {
  id: string;
  cleaner_id: string;
  booking_id: string;
  reason: string;
  status: string;
  admin_response?: string | null;
  created_at: string;
  resolved_at?: string | null;
  cleaner_name: string;
  booking: { date: string | null; service: string | null } | null;
};

function statusClass(s: string): string {
  const x = s.toLowerCase();
  if (x === "open") return "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100";
  if (x === "reviewing") return "bg-blue-100 text-blue-900 dark:bg-blue-950/50 dark:text-blue-100";
  if (x === "resolved") return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100";
  if (x === "rejected") return "bg-rose-100 text-rose-900 dark:bg-rose-950/50 dark:text-rose-100";
  return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200";
}

export default function AdminEarningsDisputesPage() {
  const [rows, setRows] = useState<DisputeRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DisputeRow | null>(null);
  const [note, setNote] = useState("");
  const [adjCents, setAdjCents] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const getToken = useCallback(async () => {
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) throw new Error("Sign in as admin.");
    return token;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const q = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const res = await fetch(`/api/admin/cleaner-earnings-disputes${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as { disputes?: DisputeRow[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Load failed");
      setRows(json.disputes ?? []);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Load failed");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [getToken, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

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
      setToast("Dispute updated.");
      setSelected(null);
      setNote("");
      setAdjCents("");
      setAdjReason("");
      await load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Support</p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Cleaner earnings disputes</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Review cleaner flags on earnings. Resolving does not edit frozen ledger rows; optional adjustments are stored separately.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-zinc-600 dark:text-zinc-400">
          Status{" "}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="ml-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          >
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="reviewing">Reviewing</option>
            <option value="resolved">Resolved</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-800 dark:border-zinc-600 dark:text-zinc-100"
        >
          Refresh
        </button>
      </div>

      {loading ? <p className="text-sm text-zinc-500">Loading…</p> : null}

      {!loading && rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700">No disputes.</p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500 dark:border-zinc-700">
            <tr>
              <th className="px-3 py-2">Cleaner</th>
              <th className="px-3 py-2">Booking</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((r) => (
              <tr key={r.id} className={selected?.id === r.id ? "bg-blue-50/80 dark:bg-blue-950/20" : ""}>
                <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">{r.cleaner_name}</td>
                <td className="px-3 py-2">
                  <Link href={`/admin/bookings/${r.booking_id}`} className="font-mono text-xs text-blue-600 hover:underline dark:text-blue-400">
                    {r.booking_id.slice(0, 8)}…
                  </Link>
                  <p className="text-xs text-zinc-500">{r.booking?.date?.slice(0, 10) ?? "—"}</p>
                </td>
                <td className="max-w-[240px] truncate px-3 py-2 text-zinc-700 dark:text-zinc-300" title={r.reason}>
                  {r.reason}
                </td>
                <td className="px-3 py-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", statusClass(r.status))}>{r.status}</span>
                </td>
                <td className="px-3 py-2 text-xs text-zinc-500">{new Date(r.created_at).toLocaleString("en-ZA")}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(r);
                      setNote(r.admin_response ?? "");
                      setAdjCents("");
                      setAdjReason("");
                    }}
                    className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Manage
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          onClick={() => (busy ? null : setSelected(null))}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Dispute</h2>
            <p className="mt-1 text-xs text-zinc-500">
              {selected.cleaner_name} ·{" "}
              <Link className="text-blue-600 hover:underline" href={`/admin/bookings/${selected.booking_id}`}>
                Booking
              </Link>
            </p>
            <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950/50 dark:text-zinc-200">
              <p className="text-xs font-semibold text-zinc-500">Cleaner reason</p>
              <p className="mt-1 whitespace-pre-wrap">{selected.reason}</p>
            </div>
            {selected.admin_response ? (
              <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                <span className="font-semibold">Last admin note: </span>
                {selected.admin_response}
              </div>
            ) : null}

            <label className="mt-4 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Admin response / note
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                placeholder={selected.status === "open" || selected.status === "reviewing" ? "Visible to internal review…" : ""}
              />
            </label>

            {selected.status !== "resolved" && selected.status !== "rejected" ? (
              <div className="mt-4 space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-700">
                <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Optional when resolving</p>
                <label className="block text-xs text-zinc-600 dark:text-zinc-400">
                  Adjustment (cents, + or −)
                  <input
                    type="number"
                    value={adjCents}
                    onChange={(e) => setAdjCents(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1.5 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    placeholder="e.g. 5000 or -2500"
                  />
                </label>
                <label className="block text-xs text-zinc-600 dark:text-zinc-400">
                  Adjustment reason
                  <input
                    value={adjReason}
                    onChange={(e) => setAdjReason(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    placeholder="Credit for missed line…"
                  />
                </label>
                <p className="text-[10px] text-zinc-500">Creates a row in `cleaner_earnings_adjustments`; does not change the original `cleaner_earnings` snapshot.</p>
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
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 dark:border-zinc-600 dark:text-zinc-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed bottom-4 right-4 z-[60] max-w-sm rounded-lg bg-zinc-900 px-4 py-3 text-sm text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
          {toast}
        </div>
      ) : null}
    </main>
  );
}
