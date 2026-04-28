"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type BookingLine = { booking_id: string; date: string | null; amount_cents: number };

type CleanerGroup = {
  cleaner_id: string;
  cleaner_name: string;
  cleaner_phone: string;
  total_cents: number;
  bookings: BookingLine[];
};

function zarFromCents(cents: number): string {
  return `R ${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(groups: CleanerGroup[]): string {
  const lines = ["Cleaner,Booking ID,Date,Amount (ZAR)"];
  for (const g of groups) {
    const cleaner = csvEscape(g.cleaner_name);
    for (const b of g.bookings) {
      const zar = (b.amount_cents / 100).toFixed(2);
      const date = (b.date ?? "").slice(0, 10);
      lines.push([cleaner, csvEscape(b.booking_id), csvEscape(date), zar].join(","));
    }
  }
  return lines.join("\n");
}

export function AdminInvoiceEligiblePayouts() {
  const [groups, setGroups] = useState<CleanerGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const getToken = useCallback(async () => {
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) throw new Error("Please sign in as an admin.");
    return token;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/payouts/eligible", { headers: { Authorization: `Bearer ${token}` } });
      const json = (await res.json()) as { groups?: CleanerGroup[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load eligible payouts.");
      setGroups(Array.isArray(json.groups) ? json.groups : []);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed.");
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === groups.length) setSelected(new Set());
    else setSelected(new Set(groups.map((g) => g.cleaner_id)));
  };

  const selectedSummary = useMemo(() => {
    let cents = 0;
    let bookingCount = 0;
    for (const g of groups) {
      if (!selected.has(g.cleaner_id)) continue;
      cents += g.total_cents;
      bookingCount += g.bookings.length;
    }
    return { cleanerCount: selected.size, totalCents: cents, bookingCount };
  }, [groups, selected]);

  const markPaidConfirmed = async () => {
    if (selected.size === 0) {
      setToast("Select at least one cleaner.");
      setConfirmOpen(false);
      return;
    }
    setBusy(true);
    setToast(null);
    setConfirmOpen(false);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/payouts/mark-paid", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ cleaner_ids: [...selected] }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        updated_count?: number;
        payout_run_id?: string;
        replayed?: boolean;
        error?: string;
      };
      if (!res.ok) {
        const retryable = String(res.headers.get("x-retryable") ?? "").trim() === "1";
        const base = json.error ?? "Mark paid failed.";
        throw new Error(retryable ? `${base} You can try again in a few seconds.` : base);
      }
      const replayed =
        json.replayed === true || String(res.headers.get("x-idempotent-replayed") ?? "").trim() === "1";
      if (replayed) {
        setToast("Nothing new to mark — no eligible rows left for the selected cleaners.");
      } else {
        setToast(
          `Marked ${json.updated_count ?? 0} booking(s) paid${json.payout_run_id ? ` · run ${json.payout_run_id.slice(0, 8)}…` : ""}.`,
        );
      }
      setSelected(new Set());
      await load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Mark paid failed.");
    } finally {
      setBusy(false);
    }
  };

  const requestMarkPaid = () => {
    if (selected.size === 0) {
      setToast("Select at least one cleaner.");
      return;
    }
    setConfirmOpen(true);
  };

  const exportCsv = () => {
    if (groups.length === 0) return;
    const blob = new Blob([buildCsv(groups)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eligible-payouts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const grandTotal = useMemo(() => groups.reduce((s, g) => s + g.total_cents, 0), [groups]);

  if (loading) {
    return <p className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900">Loading eligible bookings…</p>;
  }

  if (error) {
    return (
      <p className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100">
        {error}
      </p>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="font-medium text-zinc-900 dark:text-zinc-50">No payouts ready</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Bookings appear here when customer invoices are fully paid and <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">payout_status</code> is{" "}
          <span className="font-semibold">eligible</span>.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Invoice-eligible payouts</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Grouped by cleaner. Marking paid sets <span className="font-medium">payout_status</span> to <span className="font-medium">paid</span> for all eligible
            bookings for the selected cleaners (idempotent).
          </p>
          <p className="mt-2 text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">Total ready: {zarFromCents(grandTotal)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Export CSV
          </button>
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={requestMarkPaid}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 hover:bg-emerald-700"
          >
            {busy ? "Saving…" : "Mark as paid"}
          </button>
        </div>
      </div>

      {selected.size > 0 ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50/90 px-4 py-3 text-sm text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-100">
          <p className="font-semibold">Selected</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            <li>
              {selectedSummary.cleanerCount} cleaner{selectedSummary.cleanerCount === 1 ? "" : "s"}
            </li>
            <li>{selectedSummary.bookingCount} eligible booking{selectedSummary.bookingCount === 1 ? "" : "s"}</li>
            <li className="font-semibold tabular-nums">{zarFromCents(selectedSummary.totalCents)} total</li>
          </ul>
        </div>
      ) : null}

      {toast ? (
        <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-100">
          {toast}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-zinc-100 dark:border-zinc-800">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950/50">
            <tr>
              <th className="w-10 px-3 py-2">
                <input type="checkbox" checked={selected.size > 0 && selected.size === groups.length} onChange={selectAll} aria-label="Select all cleaners" />
              </th>
              <th className="px-3 py-2">Cleaner</th>
              <th className="px-3 py-2">Bookings</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2"> </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {groups.map((g) => {
              const open = expanded.has(g.cleaner_id);
              return (
                <Fragment key={g.cleaner_id}>
                  <tr className="align-top">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(g.cleaner_id)}
                        onChange={() => toggleSelect(g.cleaner_id)}
                        aria-label={`Select ${g.cleaner_name}`}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-zinc-900 dark:text-zinc-50">{g.cleaner_name}</p>
                      {g.cleaner_phone ? <p className="text-xs text-zinc-500">{g.cleaner_phone}</p> : null}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">{g.bookings.length}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{zarFromCents(g.total_cents)}</td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => toggleExpand(g.cleaner_id)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400"
                      >
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        {open ? "Hide" : "Show"} bookings
                      </button>
                    </td>
                  </tr>
                  {open ? (
                    <tr className="bg-zinc-50/90 dark:bg-zinc-950/50">
                      <td colSpan={5} className="px-3 py-2">
                        <ul className="space-y-1 text-xs">
                          {g.bookings.map((b) => (
                            <li key={b.booking_id} className="flex flex-wrap justify-between gap-2 font-mono text-zinc-700 dark:text-zinc-300">
                              <span>{b.booking_id}</span>
                              <span>{(b.date ?? "—").slice(0, 10)}</span>
                              <span className="font-semibold">{zarFromCents(b.amount_cents)}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirmOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="payout-confirm-title">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close confirmation"
            onClick={() => !busy && setConfirmOpen(false)}
          />
          <div className="relative z-[101] w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <h3 id="payout-confirm-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Confirm payout
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              You are about to mark all <strong className="text-zinc-900 dark:text-zinc-100">eligible</strong> bookings as{" "}
              <strong className="text-zinc-900 dark:text-zinc-100">paid</strong> for:
            </p>
            <ul className="mt-3 space-y-1 rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-950/60">
              <li>
                • {selectedSummary.cleanerCount} cleaner{selectedSummary.cleanerCount === 1 ? "" : "s"}
              </li>
              <li>• {selectedSummary.bookingCount} booking{selectedSummary.bookingCount === 1 ? "" : "s"}</li>
              <li className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">• {zarFromCents(selectedSummary.totalCents)} total</li>
            </ul>
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">This cannot be undone from the app. Re-running mark-paid on the same cleaners is safe (0 updates).</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void markPaidConfirmed()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Confirm & mark paid"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
