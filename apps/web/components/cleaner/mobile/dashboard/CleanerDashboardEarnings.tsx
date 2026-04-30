"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";

type LedgerRow = {
  earnings_id: string;
  booking_id: string;
  date: string | null;
  service_label: string;
  total_booking_cents: number | null;
  amount_cents: number;
  status: string;
  created_at: string;
  approved_at?: string | null;
  paid_at?: string | null;
};

type EarningsApiResponse = {
  total_pending?: number;
  total_approved?: number;
  total_paid?: number;
  total_all_time?: number;
  line_item_ledger?: { rows?: LedgerRow[] };
  error?: string;
};

type LineItemRow = Record<string, unknown>;

type BreakdownResponse = {
  booking: Record<string, unknown> | null;
  booking_line_items: LineItemRow[];
  cleaner_earnings: Record<string, unknown> | null;
  error?: string;
};

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "paid") return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200";
  if (s === "approved") return "bg-sky-100 text-sky-900 dark:bg-sky-950/60 dark:text-sky-200";
  return "bg-amber-100 text-amber-950 dark:bg-amber-950/50 dark:text-amber-100";
}

function groupKey(date: string | null, createdAt: string): string {
  if (date && /^\d{4}-\d{2}-\d{2}/.test(date)) return date.slice(0, 10);
  return createdAt.slice(0, 10);
}

function lineCents(row: LineItemRow): number {
  const c = row.total_price_cents;
  if (typeof c === "number" && Number.isFinite(c)) return Math.max(0, Math.round(c));
  return 0;
}

function breakdownBuckets(lines: LineItemRow[]) {
  let base = 0;
  let extras = 0;
  for (const li of lines) {
    const t = String(li.item_type ?? "").toLowerCase();
    const c = lineCents(li);
    if (t === "extra") extras += c;
    else if (t === "base" || t === "room" || t === "bathroom" || t === "adjustment") base += c;
    else base += c;
  }
  return { base, extras, linesTotal: base + extras };
}

export function CleanerDashboardEarnings() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totals, setTotals] = useState({ total_pending: 0, total_approved: 0, total_paid: 0, total_all_time: 0 });
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<"all" | "pending" | "approved" | "paid">("all");
  const [modalBookingId, setModalBookingId] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownResponse | null>(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [activeDispute, setActiveDispute] = useState<{ id: string; status: string; created_at: string } | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeBusy, setDisputeBusy] = useState(false);
  const [disputeMsg, setDisputeMsg] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (from.trim()) p.set("from", from.trim());
    if (to.trim()) p.set("to", to.trim());
    if (status !== "all") p.set("status", status);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [from, to, status]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await getCleanerAuthHeaders();
      if (!headers) {
        setError("Not signed in.");
        setRows([]);
        setLoading(false);
        return;
      }
      const res = await cleanerAuthenticatedFetch(`/api/cleaner/earnings${queryString}`, { headers });
      const json = (await res.json()) as EarningsApiResponse;
      if (!res.ok) {
        setError(json.error ?? "Could not load earnings.");
        setRows([]);
        setLoading(false);
        return;
      }
      setTotals({
        total_pending: Math.max(0, Math.round(Number(json.total_pending) || 0)),
        total_approved: Math.max(0, Math.round(Number(json.total_approved) || 0)),
        total_paid: Math.max(0, Math.round(Number(json.total_paid) || 0)),
        total_all_time: Math.max(0, Math.round(Number(json.total_all_time) || 0)),
      });
      setRows(Array.isArray(json.line_item_ledger?.rows) ? (json.line_item_ledger!.rows as LedgerRow[]) : []);
    } catch {
      setError("Could not load earnings.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!loading && error === "Not signed in.") {
      router.replace("/cleaner/login?redirect=/cleaner/dashboard");
    }
  }, [loading, error, router]);

  useEffect(() => {
    if (!modalBookingId) {
      setBreakdown(null);
      return;
    }
    let cancelled = false;
    setBreakdownLoading(true);
    (async () => {
      try {
        const headers = await getCleanerAuthHeaders();
        if (!headers || cancelled) return;
        const res = await cleanerAuthenticatedFetch(
          `/api/cleaner/earnings/breakdown?booking_id=${encodeURIComponent(modalBookingId)}`,
          { headers },
        );
        const json = (await res.json()) as BreakdownResponse;
        if (!cancelled) {
          setBreakdown(res.ok ? json : { booking: null, booking_line_items: [], cleaner_earnings: null, error: json.error });
        }
      } catch {
        if (!cancelled) setBreakdown({ booking: null, booking_line_items: [], cleaner_earnings: null });
      } finally {
        if (!cancelled) setBreakdownLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modalBookingId]);

  useEffect(() => {
    if (!modalBookingId) {
      setActiveDispute(null);
      setDisputeReason("");
      setDisputeMsg(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const headers = await getCleanerAuthHeaders();
        if (!headers || cancelled) return;
        const res = await cleanerAuthenticatedFetch(
          `/api/cleaner/earnings/dispute?booking_id=${encodeURIComponent(modalBookingId)}`,
          { headers },
        );
        const json = (await res.json()) as { active?: { id: string; status: string; created_at: string } | null };
        if (!cancelled) setActiveDispute(res.ok && json.active ? json.active : null);
      } catch {
        if (!cancelled) setActiveDispute(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modalBookingId]);

  const grouped = useMemo(() => {
    const map = new Map<string, LedgerRow[]>();
    for (const r of rows) {
      const k = groupKey(r.date, r.created_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
  }, [rows]);

  const cards = [
    { label: "Total earned", sub: "All time", cents: totals.total_all_time, tone: "bg-white dark:bg-zinc-900" },
    { label: "Pending", sub: "Awaiting approval", cents: totals.total_pending, tone: "bg-amber-50/80 dark:bg-amber-950/20" },
    { label: "Approved", sub: "Ready for payout", cents: totals.total_approved, tone: "bg-sky-50/80 dark:bg-sky-950/20" },
    { label: "Paid", sub: "In your pocket", cents: totals.total_paid, tone: "bg-emerald-50/80 dark:bg-emerald-950/20" },
  ];

  return (
    <div className="pb-28">
      <div className="sticky top-0 z-30 border-b border-zinc-200/80 bg-zinc-50/95 pb-3 pt-2 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="mx-auto max-w-md px-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Dashboard</h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Earnings &amp; history</p>
            </div>
            <div className="flex gap-3 text-xs font-semibold">
              <Link href="/cleaner" className="text-blue-600 hover:underline dark:text-blue-400">
                Jobs
              </Link>
              <Link href="/cleaner/earnings" className="text-zinc-600 hover:underline dark:text-zinc-400">
                Payouts
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {cards.map((c) => (
              <div
                key={c.label}
                className={`rounded-2xl border border-zinc-200/90 px-2.5 py-2 shadow-sm dark:border-zinc-800 ${c.tone}`}
              >
                <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{c.label}</p>
                <p className="mt-0.5 truncate text-sm font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {formatZarFromCents(c.cents)}
                </p>
                <p className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">{c.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-md space-y-4 px-4 pt-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">Filters</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
              From
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-0.5 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-2 py-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
              To
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-0.5 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-2 py-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
          </div>
          <label className="mt-2 block text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              className="mt-0.5 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-2 py-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="paid">Paid</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 w-full rounded-xl bg-zinc-900 py-2.5 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            Apply filters
          </button>
        </div>

        {loading && (
          <div className="space-y-3">
            <div className="h-20 animate-pulse rounded-2xl bg-zinc-200/80 dark:bg-zinc-800/80" />
            <div className="h-20 animate-pulse rounded-2xl bg-zinc-200/80 dark:bg-zinc-800/80" />
          </div>
        )}

        {!loading && error && error !== "Not signed in." && (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
            {error}
          </p>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-12 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">No earnings yet</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Completed jobs with recorded payouts will show here.</p>
          </div>
        )}

        {!loading &&
          !error &&
          grouped.map(([dateKey, list]) => (
            <section key={dateKey}>
              <h2 className="mb-2 px-0.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {dateKey}
              </h2>
              <ul className="space-y-2">
                {list.map((r) => (
                  <li key={r.earnings_id}>
                    <button
                      type="button"
                      onClick={() => setModalBookingId(r.booking_id)}
                      className="w-full rounded-2xl border border-zinc-200 bg-white p-3 text-left shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/80"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{r.service_label}</p>
                          <p className="mt-0.5 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">{r.booking_id}</p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${statusBadgeClass(r.status)}`}
                        >
                          {r.status}
                        </span>
                      </div>
                      <p className="mt-2 text-base font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
                        {formatZarFromCents(r.amount_cents)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>

      {modalBookingId && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="earnings-detail-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalBookingId(null);
          }}
        >
          <div
            className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white shadow-xl dark:rounded-2xl dark:bg-zinc-900 sm:max-h-[85vh] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
              <h3 id="earnings-detail-title" className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
                Earnings detail
              </h3>
              <button
                type="button"
                onClick={() => setModalBookingId(null)}
                className="rounded-full px-3 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Close
              </button>
            </div>
            <div className="space-y-4 p-4">
              {breakdownLoading && <p className="text-sm text-zinc-500">Loading breakdown…</p>}
              {!breakdownLoading && breakdown?.error && (
                <p className="text-sm text-rose-600 dark:text-rose-400">{breakdown.error}</p>
              )}
              {!breakdownLoading && breakdown && !breakdown.error && (
                <>
                  {(() => {
                    const lines = breakdown.booking_line_items ?? [];
                    const { base, extras, linesTotal } = breakdownBuckets(lines);
                    const b = breakdown.booking;
                    const ce = breakdown.cleaner_earnings;
                    const totalBooking =
                      typeof b?.total_paid_zar === "number" && Number.isFinite(b.total_paid_zar as number)
                        ? Math.round((b.total_paid_zar as number) * 100)
                        : typeof b?.amount_paid_cents === "number"
                          ? Math.round(b.amount_paid_cents as number)
                          : linesTotal;
                    const cleanerCents =
                      typeof ce?.amount_cents === "number" ? Math.round(ce.amount_cents as number) : 0;
                    return (
                      <>
                        <dl className="space-y-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/50">
                          <div className="flex justify-between text-xs">
                            <dt className="text-zinc-600 dark:text-zinc-400">Base service</dt>
                            <dd className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                              {formatZarFromCents(base)}
                            </dd>
                          </div>
                          <div className="flex justify-between text-xs">
                            <dt className="text-zinc-600 dark:text-zinc-400">Extras</dt>
                            <dd className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                              {formatZarFromCents(extras)}
                            </dd>
                          </div>
                          <div className="flex justify-between border-t border-zinc-200 pt-2 text-sm dark:border-zinc-800">
                            <dt className="font-medium text-zinc-800 dark:text-zinc-200">Total booking</dt>
                            <dd className="font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
                              {formatZarFromCents(totalBooking)}
                            </dd>
                          </div>
                          <div className="flex justify-between text-sm">
                            <dt className="font-medium text-emerald-800 dark:text-emerald-200">Your earnings</dt>
                            <dd className="font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                              {formatZarFromCents(cleanerCents)}
                            </dd>
                          </div>
                          {ce && (
                            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                              Status: <span className="font-semibold capitalize">{String(ce.status)}</span>
                            </p>
                          )}
                        </dl>
                        <div>
                          <p className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">Line items</p>
                          <ul className="space-y-1.5">
                            {lines.length === 0 && (
                              <li className="text-xs text-zinc-500">No line items stored for this booking.</li>
                            )}
                            {lines.map((li) => (
                              <li
                                key={String(li.id ?? `${li.slug}-${li.name}`)}
                                className="flex justify-between gap-2 rounded-xl border border-zinc-100 bg-white px-2 py-1.5 text-xs dark:border-zinc-800 dark:bg-zinc-900"
                              >
                                <span className="min-w-0 truncate text-zinc-700 dark:text-zinc-200">
                                  <span className="text-zinc-400">{String(li.item_type ?? "")}</span> ·{" "}
                                  {String(li.name ?? li.slug ?? "—")}
                                </span>
                                <span className="shrink-0 font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
                                  {formatZarFromCents(lineCents(li))}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <Link
                          href={`/cleaner/job/${encodeURIComponent(modalBookingId)}`}
                          className="block w-full rounded-xl border border-zinc-200 py-2.5 text-center text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          Open job
                        </Link>
                        <div className="rounded-2xl border border-zinc-200 bg-amber-50/50 p-3 dark:border-zinc-700 dark:bg-amber-950/20">
                          <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Report an issue</p>
                          <p className="mt-0.5 text-[10px] text-zinc-600 dark:text-zinc-400">
                            Flag incorrect earnings for admin review. Your frozen earnings line is not changed automatically.
                          </p>
                          {activeDispute ? (
                            <p className="mt-2 rounded-lg bg-white px-2 py-1.5 text-xs font-medium text-amber-900 dark:bg-zinc-900 dark:text-amber-100">
                              Dispute submitted — status: <span className="capitalize">{activeDispute.status}</span>
                            </p>
                          ) : (
                            <>
                              <textarea
                                value={disputeReason}
                                onChange={(e) => setDisputeReason(e.target.value)}
                                rows={3}
                                placeholder="Describe what looks wrong…"
                                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                              />
                              {disputeMsg ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{disputeMsg}</p> : null}
                              <button
                                type="button"
                                disabled={disputeBusy || disputeReason.trim().length < 3}
                                onClick={async () => {
                                  setDisputeBusy(true);
                                  setDisputeMsg(null);
                                  try {
                                    const headers = await getCleanerAuthHeaders();
                                    if (!headers) {
                                      setDisputeMsg("Not signed in.");
                                      return;
                                    }
                                    const res = await cleanerAuthenticatedFetch("/api/cleaner/earnings/dispute", {
                                      method: "POST",
                                      headers: { ...headers, "Content-Type": "application/json" },
                                      body: JSON.stringify({
                                        booking_id: modalBookingId,
                                        reason: disputeReason.trim(),
                                      }),
                                    });
                                    const json = (await res.json()) as { error?: string; dispute?: { id: string; status: string; created_at: string } };
                                    if (!res.ok) {
                                      setDisputeMsg(json.error ?? "Could not submit.");
                                      return;
                                    }
                                    if (json.dispute) {
                                      setActiveDispute({
                                        id: String(json.dispute.id),
                                        status: String(json.dispute.status),
                                        created_at: String(json.dispute.created_at),
                                      });
                                      setDisputeReason("");
                                    }
                                  } catch {
                                    setDisputeMsg("Network error.");
                                  } finally {
                                    setDisputeBusy(false);
                                  }
                                }}
                                className="mt-2 w-full rounded-xl bg-zinc-900 py-2.5 text-xs font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                              >
                                {disputeBusy ? "Submitting…" : "Submit report"}
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
