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

function formatDateLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function paidThisMonthCents(rows: EarningsRow[], monthYmd: string): number {
  return rows.reduce((sum, row) => {
    if (String(row.payout_status ?? "").toLowerCase() !== "paid") return sum;
    const paidYmd = row.payout_paid_at?.slice(0, 10);
    if (!paidYmd?.startsWith(monthYmd)) return sum;
    return sum + Math.max(0, row.amount_cents ?? 0);
  }, 0);
}

function sectionTitle(label: string) {
  return (
    <h2 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-widest text-slate-400">
      {label}
    </h2>
  );
}

function MoneyCard({ label, cents, highlight = false }: { label: string; cents: number; highlight?: boolean }) {
  return (
    <div
      className={`rounded-2xl border px-3 py-4 shadow-sm ${
        highlight ? "border-emerald-100 bg-emerald-50" : "border-gray-100 bg-white"
      }`}
    >
      <p className="text-xs font-medium leading-4 text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-extrabold tabular-nums ${highlight ? "text-emerald-700" : "text-slate-900"}`}>
        {formatZarFromCents(cents)}
      </p>
    </div>
  );
}

function EmptyCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-7 text-center">
      <p className="font-semibold text-slate-700">{title}</p>
      <p className="mt-1 text-sm text-slate-400">{message}</p>
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
  const recentEarnings = rows.slice(0, 5);
  const paymentHistory = rows
    .filter((row) => String(row.payout_status ?? "").toLowerCase() === "paid")
    .sort((a, b) => (b.payout_paid_at ?? b.date ?? "").localeCompare(a.payout_paid_at ?? a.date ?? ""))
    .slice(0, 20);

  const todayCents = payload?.summary?.today_cents ?? 0;
  const weekCents = payload?.summary?.week_cents ?? 0;
  const monthCents = payload?.summary?.month_cents ?? 0;
  const pendingCents = payload?.summary?.pending_cents ?? payload?.total_pending ?? 0;
  const eligibleCents = payload?.summary?.eligible_cents ?? payload?.total_approved ?? 0;
  const paidMonthCents = paidThisMonthCents(rows, todayYmd.slice(0, 7));
  const lifetimeCents = payload?.total_all_time ?? payload?.total_paid ?? payload?.summary?.paid_cents ?? 0;
  const completedBookings = rows.length;

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-3 px-4 pt-4 animate-pulse">
        <div className="h-8 w-40 rounded-xl bg-gray-200" />
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((item) => <div key={item} className="h-24 rounded-2xl bg-gray-200" />)}
        </div>
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
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void load();
            }}
            className="mt-3 rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white"
          >
            Try again
          </button>
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
        <MoneyCard label="Today's earnings" cents={todayCents} highlight />
        <MoneyCard label="This week" cents={weekCents} />
        <MoneyCard label="This month" cents={monthCents} />
      </div>

      {sectionTitle("Payout summary")}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm divide-y divide-gray-100">
        {[
          ["Pending approval", pendingCents, "text-amber-600"],
          ["Eligible for payout", eligibleCents, "text-blue-600"],
          ["Paid this month", paidMonthCents, "text-emerald-600"],
        ].map(([label, cents, colour]) => (
          <div key={String(label)} className="flex items-center justify-between gap-3 px-4 py-3.5">
            <span className="text-sm font-medium text-slate-700">{String(label)}</span>
            <span className={`text-sm font-bold tabular-nums ${String(colour)}`}>
              {formatZarFromCents(Number(cents))}
            </span>
          </div>
        ))}
      </div>

      {sectionTitle("Recent earnings")}
      {recentEarnings.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm divide-y divide-gray-100">
          {recentEarnings.map((row) => (
            <Link
              key={row.booking_id}
              href={`/jobs/${row.booking_id}`}
              className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-gray-50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{row.service || "Cleaning job"}</p>
                <p className="mt-0.5 text-xs text-slate-400">{formatDateLabel(row.date)}</p>
              </div>
              <span className="shrink-0 text-sm font-bold tabular-nums text-emerald-700">
                {formatZarFromCents(row.amount_cents ?? 0)}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyCard title="No recent earnings" message="Completed jobs will appear here." />
      )}

      {sectionTitle("Payment history")}
      {paymentHistory.length > 0 ? (
        <div className="space-y-2">
          {paymentHistory.map((row) => {
            const batchLabel = row.payout_run_id ? `Batch ${row.payout_run_id.slice(0, 8)}` : "Payout";
            return (
              <Link
                key={`${row.booking_id}:${row.payout_run_id ?? row.payout_paid_at ?? "paid"}`}
                href={`/jobs/${row.booking_id}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm transition-colors hover:bg-gray-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{batchLabel}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {formatDateLabel(row.payout_paid_at ?? row.date)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-sm font-bold tabular-nums text-slate-900">
                    {formatZarFromCents(row.amount_cents ?? 0)}
                  </span>
                  <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                    Paid
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyCard title="No payment history" message="Completed payouts will appear here." />
      )}

      {sectionTitle("Performance summary")}
      <div className="grid grid-cols-2 gap-2">
        <MoneyCard label="Total lifetime earnings" cents={lifetimeCents} />
        <div className="rounded-2xl border border-gray-100 bg-white px-3 py-4 shadow-sm">
          <p className="text-xs font-medium leading-4 text-slate-500">Bookings completed</p>
          <p className="mt-1 text-lg font-extrabold tabular-nums text-slate-900">
            {completedBookings.toLocaleString("en-ZA")}
          </p>
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
