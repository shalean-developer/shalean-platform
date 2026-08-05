"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";
import { johannesburgCalendarYmd } from "@/lib/dashboard/johannesburgMonth";

type EarningsRow = {
  booking_id: string;
  date?: string;
  service?: string;
  payout_status?: string;
  amount_cents?: number;
  payout_paid_at?: string | null;
  payout_run_id?: string | null;
};

type EarningsJson = {
  error?: string;
  summary?: {
    today_cents?: number;
    week_cents?: number;
    month_cents?: number;
    pending_cents?: number;
    eligible_cents?: number;
    paid_cents?: number;
  };
  total_pending?: number;
  total_approved?: number;
  total_paid?: number;
  total_all_time?: number;
  rows?: EarningsRow[];
};

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function sectionTitle(title: string) {
  return <h2 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</h2>;
}

function MoneyCard({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-3 py-4 shadow-sm">
      <p className="text-xs font-medium leading-4 text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-extrabold tabular-nums text-slate-900">{formatZarFromCents(amount)}</p>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-7 text-center">
      <p className="font-semibold text-slate-700">{title}</p>
      <p className="mt-1 text-sm text-slate-400">{text}</p>
    </div>
  );
}

function EarningsPageContent() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<EarningsJson | null>(null);

  const todayYmd = useMemo(() => {
    try {
      return johannesburgCalendarYmd(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }, []);

  const load = useCallback(async () => {
    const headers = await getCleanerAuthHeaders();
    if (!headers) {
      setError("Not signed in.");
      setLoading(false);
      return;
    }
    try {
      const response = await cleanerAuthenticatedFetch("/api/cleaner/earnings", { headers });
      const json = (await response.json().catch(() => ({}))) as EarningsJson;
      if (!response.ok) throw new Error(json.error ?? "Could not load earnings.");
      setPayload(json);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load earnings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(
    () => (payload?.rows ?? []).slice().sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
    [payload?.rows],
  );
  const recent = rows.slice(0, 5);
  const paidRows = rows
    .filter((row) => String(row.payout_status ?? "").toLowerCase() === "paid")
    .sort((a, b) => (b.payout_paid_at ?? b.date ?? "").localeCompare(a.payout_paid_at ?? a.date ?? ""))
    .slice(0, 20);

  const monthPrefix = todayYmd.slice(0, 7);
  const paidThisMonth = paidRows.reduce((sum, row) => {
    if (!row.payout_paid_at?.slice(0, 10).startsWith(monthPrefix)) return sum;
    return sum + Math.max(0, row.amount_cents ?? 0);
  }, 0);

  const today = payload?.summary?.today_cents ?? 0;
  const week = payload?.summary?.week_cents ?? 0;
  const month = payload?.summary?.month_cents ?? 0;
  const pending = payload?.summary?.pending_cents ?? payload?.total_pending ?? 0;
  const eligible = payload?.summary?.eligible_cents ?? payload?.total_approved ?? 0;
  const lifetime = payload?.total_all_time ?? payload?.total_paid ?? payload?.summary?.paid_cents ?? 0;

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-3 px-4 pt-4 animate-pulse">
        <div className="h-8 w-40 rounded-xl bg-gray-200" />
        <div className="grid grid-cols-3 gap-2">{[1, 2, 3].map((item) => <div key={item} className="h-24 rounded-2xl bg-gray-200" />)}</div>
        <div className="h-40 rounded-2xl bg-gray-200" />
        <div className="h-52 rounded-2xl bg-gray-200" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 pt-4">
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-4">
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={() => { setLoading(true); void load(); }} className="mt-3 rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white">Try again</button>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-8 pt-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Earnings</h1>
        <p className="mt-0.5 text-sm text-slate-400">Your income overview.</p>
      </header>

      {sectionTitle("Earnings summary")}
      <div className="grid grid-cols-3 gap-2">
        <MoneyCard label="Today's earnings" amount={today} />
        <MoneyCard label="This week" amount={week} />
        <MoneyCard label="This month" amount={month} />
      </div>

      {sectionTitle("Payout summary")}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm divide-y divide-gray-100">
        {[
          ["Pending approval", pending, "text-amber-600"],
          ["Eligible for payout", eligible, "text-blue-600"],
          ["Paid this month", paidThisMonth, "text-emerald-600"],
        ].map(([label, amount, colour]) => (
          <div key={String(label)} className="flex items-center justify-between gap-3 px-4 py-3.5">
            <span className="text-sm font-medium text-slate-700">{String(label)}</span>
            <span className={`text-sm font-bold tabular-nums ${String(colour)}`}>{formatZarFromCents(Number(amount))}</span>
          </div>
        ))}
      </div>

      {sectionTitle("Recent earnings")}
      {recent.length ? (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm divide-y divide-gray-100">
          {recent.map((row) => (
            <Link key={row.booking_id} href={`/jobs/${row.booking_id}`} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-slate-50">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">{row.service || "Cleaning job"}</p>
                <p className="mt-0.5 text-xs text-slate-400">{formatDate(row.date)}</p>
              </div>
              <span className="shrink-0 text-sm font-bold tabular-nums text-slate-900">{formatZarFromCents(row.amount_cents ?? 0)}</span>
            </Link>
          ))}
        </div>
      ) : <EmptyState title="No recent earnings" text="Completed jobs will appear here." />}

      {sectionTitle("Payment history")}
      {paidRows.length ? (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm divide-y divide-gray-100">
          {paidRows.map((row) => (
            <Link key={`${row.booking_id}-${row.payout_paid_at ?? "paid"}`} href={`/jobs/${row.booking_id}`} className="block px-4 py-3.5 hover:bg-slate-50">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{formatDate(row.payout_paid_at ?? row.date)}</p>
                  <p className="mt-0.5 text-xs text-slate-400">Batch {row.payout_run_id ?? "reference unavailable"}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums text-slate-900">{formatZarFromCents(row.amount_cents ?? 0)}</p>
                  <p className="mt-0.5 text-xs font-semibold text-emerald-600">Paid</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : <EmptyState title="No payment history" text="Paid earnings will appear here." />}

      {sectionTitle("Performance summary")}
      <div className="grid grid-cols-2 gap-2">
        <MoneyCard label="Total lifetime earnings" amount={lifetime} />
        <div className="rounded-2xl border border-gray-100 bg-white px-3 py-4 shadow-sm">
          <p className="text-xs font-medium leading-4 text-slate-500">Bookings completed</p>
          <p className="mt-1 text-lg font-extrabold tabular-nums text-slate-900">{rows.length}</p>
        </div>
      </div>
    </main>
  );
}

export default function JobsEarningsPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-slate-400">Loading…</div>}>
      <EarningsPageContent />
    </Suspense>
  );
}
