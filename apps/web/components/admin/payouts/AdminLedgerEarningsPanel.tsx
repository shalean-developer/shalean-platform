"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

type Totals = {
  pending_cents: number;
  approved_cents: number;
  processing_cents?: number;
  paid_cents: number;
  paid_last_30d_cents: number;
};

type ByCleanerRow = {
  cleaner_id: string;
  full_name: string;
  pending_cents: number;
  approved_cents: number;
  processing_cents?: number;
  paid_cents: number;
  pending_count: number;
  approved_count?: number;
  processing_count?: number;
  paid_count?: number;
  bank_ready?: boolean;
  recipient_ready?: boolean;
  missing_reason?: string | null;
};

type EarningRow = {
  id: string;
  cleaner_id: string;
  booking_id: string;
  amount_cents: number;
  status: string;
  created_at?: string;
  approved_at?: string | null;
  paid_at?: string | null;
  cleaner_name?: string | null;
  booking?: { date: string | null; service: string | null; location: string | null } | null;
};

type DisbRow = {
  id: string;
  cleaner_id: string;
  cleaner_name: string;
  total_amount_cents: number;
  status: string;
  created_at: string;
  paid_at?: string | null;
  paystack_reference?: string | null;
  transfer_code?: string | null;
};

type Toast = { kind: "success" | "error"; text: string } | null;

function zarFromCents(cents: number): string {
  const n = Math.round(cents) / 100;
  return `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "pending") return "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-100";
  if (s === "approved") return "bg-blue-100 text-blue-900 dark:bg-blue-950/60 dark:text-blue-100";
  if (s === "processing") return "bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-100";
  if (s === "paid" || s === "success") return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100";
  if (s === "failed") return "bg-rose-100 text-rose-900 dark:bg-rose-950/50 dark:text-rose-100";
  return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200";
}

async function readJson<T>(res: Response): Promise<T & { error?: string }> {
  const text = await res.text();
  if (!text.trim()) return {} as T & { error?: string };
  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    return { error: res.ok ? "Invalid JSON" : text.slice(0, 240) } as T & { error?: string };
  }
}

export function AdminLedgerEarningsPanel() {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [byCleaner, setByCleaner] = useState<ByCleanerRow[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [history, setHistory] = useState<DisbRow[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailRows, setDetailRows] = useState<EarningRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [payModal, setPayModal] = useState<{ cleanerId: string; name: string; approvedCents: number } | null>(null);

  const getToken = useCallback(async () => {
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) throw new Error("Please sign in as an admin.");
    return token;
  }, []);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/cleaners/earnings", { headers: { Authorization: `Bearer ${token}` } });
      const json = await readJson<{ totals?: Totals; by_cleaner?: ByCleanerRow[]; truncated?: boolean }>(res);
      if (!res.ok) throw new Error(json.error ?? "Could not load earnings summary.");
      setTotals(json.totals ?? null);
      setByCleaner(json.by_cleaner ?? []);
      setTruncated(Boolean(json.truncated));
    } catch (e) {
      setToast({ kind: "error", text: e instanceof Error ? e.message : "Load failed." });
    } finally {
      setSummaryLoading(false);
    }
  }, [getToken]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/cleaners/earnings/disbursements?limit=80", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await readJson<{ disbursements?: DisbRow[] }>(res);
      if (!res.ok) throw new Error(json.error ?? "Could not load payout history.");
      setHistory(json.disbursements ?? []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [getToken]);

  const loadCleanerDetail = useCallback(
    async (cleanerId: string) => {
      setDetailLoading(true);
      try {
        const token = await getToken();
        const res = await fetch(`/api/admin/cleaners/earnings?cleaner_id=${encodeURIComponent(cleanerId)}&limit=500`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await readJson<{ rows?: EarningRow[] }>(res);
        if (!res.ok) throw new Error(json.error ?? "Could not load cleaner earnings.");
        setDetailRows(json.rows ?? []);
      } catch (e) {
        setDetailRows([]);
        setToast({ kind: "error", text: e instanceof Error ? e.message : "Load failed." });
      } finally {
        setDetailLoading(false);
      }
    },
    [getToken],
  );

  useEffect(() => {
    void loadSummary();
    void loadHistory();
  }, [loadSummary, loadHistory]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!expandedId) {
      setDetailRows([]);
      return;
    }
    void loadCleanerDetail(expandedId);
  }, [expandedId, loadCleanerDetail]);

  const toggleExpand = (cleanerId: string) => {
    setExpandedId((prev) => (prev === cleanerId ? null : cleanerId));
  };

  const postApprove = async (body: Record<string, string>) => {
    const key = JSON.stringify(body);
    setBusy(key);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/cleaners/earnings/approve", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await readJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? "Approve failed.");
      setToast({ kind: "success", text: "Earnings approved." });
      await loadSummary();
      if (expandedId) await loadCleanerDetail(expandedId);
      await loadHistory();
    } catch (e) {
      setToast({ kind: "error", text: e instanceof Error ? e.message : "Approve failed." });
    } finally {
      setBusy(null);
    }
  };

  const postPayout = async (cleanerId: string) => {
    setBusy(`pay:${cleanerId}`);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/payouts/run", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ cleaner_id: cleanerId }),
      });
      const json = await readJson<{ error?: string; skipped?: boolean; reference?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? "Payout failed.");
      setToast({
        kind: "success",
        text: json.skipped ? "Transfer already completed for this batch." : `Paystack transfer started (${json.reference ?? "ok"}).`,
      });
      setPayModal(null);
      await loadSummary();
      if (expandedId === cleanerId) await loadCleanerDetail(cleanerId);
      await loadHistory();
    } catch (e) {
      setToast({ kind: "error", text: e instanceof Error ? e.message : "Payout failed." });
    } finally {
      setBusy(null);
    }
  };

  const summaryCards = useMemo(() => {
    const t = totals ?? { pending_cents: 0, approved_cents: 0, paid_cents: 0, paid_last_30d_cents: 0, processing_cents: 0 };
    return [
      { label: "Total pending", value: zarFromCents(t.pending_cents), sub: "Awaiting approval" },
      { label: "Approved (ready to pay)", value: zarFromCents(t.approved_cents), sub: "Ledger approved" },
      { label: "Paid (last 30 days)", value: zarFromCents(t.paid_last_30d_cents), sub: "From cleaner earnings" },
    ];
  }, [totals]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Ledger</p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Cleaner earnings & payouts</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Approve per-booking earnings, then pay each cleaner via Paystack. Weekly batch payouts stay under{" "}
          <strong className="text-zinc-800 dark:text-zinc-200">Paystack batches</strong>.
        </p>
      </div>

      {truncated ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          Summary capped at many rows; totals may be incomplete. Consider a DB aggregate for very large ledgers.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        {summaryCards.map((c) => (
          <div
            key={c.label}
            className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{c.label}</p>
            <p className="mt-2 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {summaryLoading ? "—" : c.value}
            </p>
            <p className="mt-1 text-xs text-zinc-500">{c.sub}</p>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Cleaners</h2>
        </div>
        {summaryLoading ? (
          <div className="flex items-center gap-2 p-8 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : byCleaner.length === 0 ? (
          <p className="p-8 text-center text-sm text-zinc-500">No cleaner earnings in the ledger yet.</p>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {byCleaner.map((row) => {
              const expanded = expandedId === row.cleaner_id;
              const payDisabled =
                row.approved_cents <= 0 ||
                Boolean(row.processing_cents && row.processing_cents > 0) ||
                busy != null;
              const bankWarn = row.bank_ready === false || row.missing_reason;
              return (
                <div key={row.cleaner_id}>
                  <div className="flex flex-wrap items-center gap-2 px-3 py-3 sm:px-4">
                    <button
                      type="button"
                      onClick={() => toggleExpand(row.cleaner_id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" /> : <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" />}
                      <span className="truncate font-semibold text-zinc-900 dark:text-zinc-50">{row.full_name}</span>
                    </button>
                    <div className="hidden text-right text-xs tabular-nums sm:block sm:w-24">
                      <span className="text-zinc-500">Pending</span>
                      <p className="font-medium text-zinc-800 dark:text-zinc-200">{zarFromCents(row.pending_cents)}</p>
                    </div>
                    <div className="hidden text-right text-xs tabular-nums sm:block sm:w-24">
                      <span className="text-zinc-500">Approved</span>
                      <p className="font-medium text-blue-800 dark:text-blue-200">{zarFromCents(row.approved_cents)}</p>
                    </div>
                    <div className="hidden text-right text-xs tabular-nums sm:block sm:w-24">
                      <span className="text-zinc-500">Paid</span>
                      <p className="font-medium text-emerald-800 dark:text-emerald-200">{zarFromCents(row.paid_cents)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={busy != null || row.pending_cents <= 0}
                        onClick={() => void postApprove({ cleaner_id: row.cleaner_id })}
                        className="rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-900 disabled:opacity-50 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100"
                      >
                        {busy === JSON.stringify({ cleaner_id: row.cleaner_id }) ? "…" : "Approve all"}
                      </button>
                      <button
                        type="button"
                        disabled={payDisabled}
                        title={
                          row.approved_cents <= 0
                            ? "No approved earnings to pay"
                            : row.processing_cents && row.processing_cents > 0
                              ? "Payout already in progress"
                              : undefined
                        }
                        onClick={() =>
                          setPayModal({ cleanerId: row.cleaner_id, name: row.full_name, approvedCents: row.approved_cents })
                        }
                        className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Pay cleaner
                      </button>
                    </div>
                  </div>
                  {bankWarn ? (
                    <div className="mx-3 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100 sm:mx-4">
                      <span className="font-semibold">Bank details: </span>
                      {row.missing_reason ?? "Add bank details before Paystack can pay this cleaner."}{" "}
                      <Link href={`/admin/cleaners/${row.cleaner_id}/payouts`} className="font-semibold underline">
                        Bank / payouts
                      </Link>
                    </div>
                  ) : row.recipient_ready === false ? (
                    <div className="mx-3 mb-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300 sm:mx-4">
                      Paystack recipient will be created on first payout (bank details OK).
                    </div>
                  ) : null}
                  {expanded ? (
                    <div className="border-t border-zinc-100 bg-zinc-50/80 px-3 py-4 dark:border-zinc-800 dark:bg-zinc-950/40 sm:px-4">
                      <div className="mb-3 grid grid-cols-3 gap-2 text-center text-xs sm:hidden">
                        <div>
                          <span className="text-zinc-500">Pending</span>
                          <p className="font-semibold">{zarFromCents(row.pending_cents)}</p>
                        </div>
                        <div>
                          <span className="text-zinc-500">Approved</span>
                          <p className="font-semibold text-blue-800 dark:text-blue-200">{zarFromCents(row.approved_cents)}</p>
                        </div>
                        <div>
                          <span className="text-zinc-500">Paid</span>
                          <p className="font-semibold text-emerald-800 dark:text-emerald-200">{zarFromCents(row.paid_cents)}</p>
                        </div>
                      </div>
                      {detailLoading ? (
                        <p className="flex items-center gap-2 text-sm text-zinc-500">
                          <Loader2 className="h-4 w-4 animate-spin" /> Loading bookings…
                        </p>
                      ) : (
                        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                          <table className="w-full min-w-[640px] text-left text-sm">
                            <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500 dark:border-zinc-700">
                              <tr>
                                <th className="px-3 py-2">Booking</th>
                                <th className="px-3 py-2">Date</th>
                                <th className="px-3 py-2">Amount</th>
                                <th className="px-3 py-2">Status</th>
                                <th className="px-3 py-2 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                              {detailRows.map((er) => {
                                const st = String(er.status ?? "").toLowerCase();
                                const busyKey = JSON.stringify({ booking_id: er.booking_id });
                                return (
                                  <tr key={er.id}>
                                    <td className="px-3 py-2 font-mono text-xs text-zinc-800 dark:text-zinc-200">
                                      <Link className="hover:underline" href={`/admin/bookings/${er.booking_id}`}>
                                        {er.booking_id.slice(0, 8)}…
                                      </Link>
                                    </td>
                                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                                      {String(er.booking?.date ?? "—").slice(0, 10)}
                                    </td>
                                    <td className="px-3 py-2 tabular-nums font-medium">{zarFromCents(er.amount_cents)}</td>
                                    <td className="px-3 py-2">
                                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", statusBadgeClass(st))}>
                                        {st}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      {st === "pending" ? (
                                        <button
                                          type="button"
                                          disabled={busy != null}
                                          onClick={() => void postApprove({ booking_id: er.booking_id })}
                                          className="rounded-md bg-blue-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                                        >
                                          {busy === busyKey ? "…" : "Approve"}
                                        </button>
                                      ) : (
                                        <span className="text-xs text-zinc-400">—</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          {!detailLoading && detailRows.length === 0 ? (
                            <p className="p-6 text-center text-sm text-zinc-500">No rows (try increasing limit).</p>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Ledger payout history</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Paystack disbursement batches (`cleaner_earnings_disbursements`)</p>
        </div>
        {historyLoading ? (
          <p className="flex items-center gap-2 p-6 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : history.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">No disbursements yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500 dark:border-zinc-700">
                <tr>
                  <th className="px-4 py-2">Cleaner</th>
                  <th className="px-4 py-2">Amount</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Paystack</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">{h.cleaner_name}</td>
                    <td className="px-4 py-2 tabular-nums">{zarFromCents(h.total_amount_cents)}</td>
                    <td className="px-4 py-2">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", statusBadgeClass(h.status))}>
                        {h.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                      {new Date(h.created_at).toLocaleString("en-ZA", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-2 font-mono text-xs text-zinc-600 dark:text-zinc-400" title={h.paystack_reference ?? h.transfer_code ?? ""}>
                      {h.paystack_reference ?? h.transfer_code ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {payModal ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          onClick={() => (busy == null ? setPayModal(null) : null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Confirm Paystack payout</h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Pay <span className="font-semibold text-zinc-900 dark:text-zinc-100">{payModal.name}</span>{" "}
              <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{zarFromCents(payModal.approvedCents)}</span> from
              approved ledger earnings?
            </p>
            <p className="mt-2 text-xs text-zinc-500">This calls Paystack <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">/transfer</code> from your balance.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 dark:border-zinc-600 dark:text-zinc-100"
                onClick={() => setPayModal(null)}
                disabled={busy != null}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy != null}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => void postPayout(payModal.cleanerId)}
              >
                {busy?.startsWith("pay:") ? "Sending…" : "Confirm payout"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div
          className={cn(
            "fixed bottom-4 right-4 z-50 max-w-sm rounded-lg px-4 py-3 text-sm font-medium shadow-lg",
            toast.kind === "error" ? "bg-rose-700 text-white" : "bg-emerald-800 text-white dark:bg-emerald-700",
          )}
        >
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}
