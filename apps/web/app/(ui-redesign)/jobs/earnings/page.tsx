"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";
import { EarningsBreakdown } from "@/components/cleaner/EarningsBreakdown";
import { johannesburgCalendarYmd } from "@/lib/dashboard/johannesburgMonth";
import { cn } from "@/lib/utils";

type EarningsJson = {
  error?: string;
  summary?: {
    today_cents?: number;
    week_cents?: number;
    month_cents?: number;
    pending_cents?: number;
    paid_cents?: number;
    suggested_daily_goal_cents?: number;
  };
  rows?: Array<{
    booking_id: string;
    date?: string;
    service?: string;
    location?: string;
    payout_status?: string;
    amount_cents?: number;
    payout_paid_at?: string | null;
  }>;
  cleaner?: { full_name?: string | null };
};

function earningsPeriodFilter(rows: NonNullable<EarningsJson["rows"]>, period: "today" | "week" | "month", todayYmd: string): typeof rows {
  if (period === "today") return rows.filter((r) => r.date === todayYmd);
  if (period === "week") {
    const d = new Date(todayYmd);
    const day = d.getDay(); // 0 = Sun, 1 = Mon ...
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((day === 0 ? 7 : day) - 1));
    const mondayYmd = monday.toISOString().slice(0, 10);
    return rows.filter((r) => (r.date ?? "") >= mondayYmd);
  }
  const monthYmd = todayYmd.slice(0, 7);
  return rows.filter((r) => (r.date ?? "").startsWith(monthYmd));
}

function statusChip(status: string | undefined): string {
  const s = (status ?? "").toLowerCase();
  if (s === "paid") return "bg-green-50 border border-green-100 text-green-700";
  if (s === "pending") return "bg-amber-50 border border-amber-100 text-amber-700";
  return "bg-gray-50 border border-gray-100 text-gray-500";
}

function EarningsPageContent() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<EarningsJson | null>(null);
  const [period, setPeriod] = useState<"today" | "week" | "month">("today");

  const todayYmd = useMemo(() => {
    try { return johannesburgCalendarYmd(new Date()); } catch { return new Date().toISOString().slice(0, 10); }
  }, []);

  const load = useCallback(async () => {
    const headers = await getCleanerAuthHeaders();
    if (!headers) { setError("Not signed in."); setLoading(false); return; }
    try {
      const res = await cleanerAuthenticatedFetch("/api/cleaner/earnings", { headers });
      const j = (await res.json().catch(() => ({}))) as EarningsJson;
      if (!res.ok) throw new Error(j.error ?? "Could not load earnings.");
      setPayload(j);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load earnings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const todayCents = payload?.summary?.today_cents ?? 0;
  const weekCents = payload?.summary?.week_cents ?? 0;
  const monthCents = payload?.summary?.month_cents ?? 0;
  const goalCents = payload?.summary?.suggested_daily_goal_cents ?? 40_000;
  const pendingCents = payload?.summary?.pending_cents ?? 0;
  const paidCents = payload?.summary?.paid_cents ?? 0;

  const goalProgress =
    goalCents > 0
      ? Math.min(100, Math.round((todayCents / goalCents) * 100))
      : 0;

  const visibleRows = useMemo(() => {
    if (!payload?.rows) return [];
    return earningsPeriodFilter(payload.rows, period, todayYmd)
      .slice()
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
      .slice(0, 50);
  }, [payload?.rows, period, todayYmd]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 pt-4 space-y-3 animate-pulse">
        <div className="h-8 w-40 rounded-xl bg-gray-200" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-2xl bg-gray-200" />)}
        </div>
        <div className="h-24 rounded-2xl bg-gray-200" />
        <div className="h-32 rounded-2xl bg-gray-200" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 pt-4">
        <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 pt-4 pb-6 space-y-4">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Earnings</h1>
        <p className="mt-0.5 text-sm text-slate-400">Your income overview.</p>
      </div>

      {/* Period tabs */}
      <div className="flex gap-2" role="tablist">
        {(["today", "week", "month"] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={period === p}
            className={cn(
              "h-9 flex-1 rounded-full border text-sm font-medium transition-colors",
              period === p
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-gray-200 bg-white text-slate-500 hover:text-slate-700",
            )}
            onClick={() => setPeriod(p)}
          >
            {p === "today" ? "Today" : p === "week" ? "This week" : "This month"}
          </button>
        ))}
      </div>

      {/* Breakdown + payout */}
      <EarningsBreakdown
        today={{ label: "Today", value: formatZarFromCents(todayCents) }}
        thisWeek={{ label: "This week", value: formatZarFromCents(weekCents) }}
        thisMonth={{ label: "This month", value: formatZarFromCents(monthCents) }}
        goalProgress={goalProgress}
        goalLabel={`${goalProgress}% of ${formatZarFromCents(goalCents)} daily goal`}
        pendingPayout={pendingCents > 0 ? formatZarFromCents(pendingCents) : undefined}
        paidPayout={paidCents > 0 ? formatZarFromCents(paidCents) : undefined}
      />

      {/* Expense claim CTA */}
      <div className="rounded-2xl border border-gray-100 bg-white px-4 py-4 shadow-sm flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">Claim an expense</p>
          <p className="mt-0.5 text-xs text-slate-400">Submit cleaning supplies or travel costs.</p>
        </div>
        <Link
          href="/jobs/profile"
          className="rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors active:scale-95 shrink-0"
        >
          Claim
        </Link>
      </div>

      {/* History */}
      {visibleRows.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Earnings history
          </h2>
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm divide-y divide-gray-50 overflow-hidden">
            {visibleRows.map((row) => (
              <div
                key={row.booking_id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 leading-tight truncate">
                    {row.service || "Cleaning job"}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400 truncate">
                    {row.date ?? "—"}
                    {row.location ? ` · ${row.location.split(/\r?\n/)[0]?.trim() ?? ""}` : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-sm font-bold tabular-nums text-slate-900">
                    {typeof row.amount_cents === "number"
                      ? formatZarFromCents(row.amount_cents)
                      : "—"}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                      statusChip(row.payout_status),
                    )}
                  >
                    {row.payout_status ?? "pending"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-8 text-center">
          <p className="font-semibold text-slate-700">No earnings for this period</p>
          <p className="mt-1 text-sm text-slate-400">Complete jobs to see your earnings here.</p>
        </div>
      )}
    </div>
  );
}

export default function JobsEarningsPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-slate-400">Loading…</div>}>
      <EarningsPageContent />
    </Suspense>
  );
}
