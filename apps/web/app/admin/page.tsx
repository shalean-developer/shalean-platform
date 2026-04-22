"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type Analytics = {
  kpis: {
    revenueToday: number;
    bookingsToday: number;
    avgBookingValue: number;
    assignmentSuccessRate: number;
  };
  funnel: {
    started: number;
    viewedPrice: number;
    selectedTime: number;
    completed: number;
    conversionToPaidPct: number;
  };
  revenueTrend: Array<{ date: string; revenue: number }>;
  supplyDemand: {
    demand: number;
    supply: number;
    ratio: number | null;
    avgSurgeMultiplier: number;
    liveSurgeMultiplier: number;
  };
  dispatch: {
    avgAssignMinutes: number;
    acceptanceRate: number;
    failedDispatchPct: number;
  };
  cleanerSupply: {
    newApplicantsToday: number;
    approvedCleaners: number;
    activeCleaners: number;
    funnel: {
      applied: number;
      approved: number;
      receivingJobs: number;
    };
  };
  subscriptions: {
    active: number;
    upcoming: number;
  };
  insights: string[];
};

export default function AdminAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Analytics | null>(null);

  useEffect(() => {
    let active = true;
    const run = async () => {
      const sb = getSupabaseBrowser();
      const session = await sb?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) {
        if (active) {
          setError("Please sign in as admin.");
          setLoading(false);
        }
        return;
      }
      const res = await fetch("/api/admin/analytics", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as Analytics & { error?: string };
      if (!active) return;
      if (!res.ok) {
        setError(json.error ?? "Failed to load analytics.");
        setLoading(false);
        return;
      }
      setData(json);
      setLoading(false);
    };
    void run();
    return () => {
      active = false;
    };
  }, []);

  const trendMax = useMemo(() => {
    const vals = data?.revenueTrend.map((d) => d.revenue) ?? [];
    return vals.length ? Math.max(...vals, 1) : 1;
  }, [data?.revenueTrend]);

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
      <section className="space-y-1">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Revenue + Operations Analytics</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Operational view for money, performance, and bottlenecks.</p>
      </section>

      {loading ? (
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-48 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        </div>
      ) : error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </p>
      ) : data ? (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard label="Revenue today" value={`R ${data.kpis.revenueToday.toLocaleString("en-ZA")}`} />
            <KpiCard label="Bookings today" value={String(data.kpis.bookingsToday)} />
            <KpiCard label="Avg booking value" value={`R ${data.kpis.avgBookingValue.toLocaleString("en-ZA")}`} />
            <KpiCard label="Assignment success rate" value={`${data.kpis.assignmentSuccessRate}%`} />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Booking funnel</h2>
              <p className="mt-1 text-xs text-zinc-500">Started → Viewed price → Selected time → Completed payment</p>
              <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
                <FunnelStep label="Started" value={data.funnel.started} pct={100} />
                <FunnelStep label="Price" value={data.funnel.viewedPrice} pct={pct(data.funnel.viewedPrice, data.funnel.started)} />
                <FunnelStep label="Time" value={data.funnel.selectedTime} pct={pct(data.funnel.selectedTime, data.funnel.started)} />
                <FunnelStep label="Paid" value={data.funnel.completed} pct={data.funnel.conversionToPaidPct} />
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Revenue trends</h2>
              <p className="mt-1 text-xs text-zinc-500">Revenue per day (last 14 days)</p>
              {data.revenueTrend.length === 0 ? (
                <p className="mt-6 text-sm text-zinc-500">No revenue trend data yet.</p>
              ) : (
                <svg viewBox="0 0 560 220" className="mt-4 h-52 w-full">
                  <polyline
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="text-emerald-600"
                    points={data.revenueTrend
                      .map((d, i) => {
                        const x = (i / Math.max(1, data.revenueTrend.length - 1)) * 540 + 10;
                        const y = 200 - (d.revenue / trendMax) * 170;
                        return `${x},${y}`;
                      })
                      .join(" ")}
                  />
                </svg>
              )}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Subscription plans</h2>
              <div className="mt-3 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
                <p>Total active subscriptions: <span className="font-semibold">{data.subscriptions.active}</span></p>
                <p>Upcoming subscription bookings: <span className="font-semibold">{data.subscriptions.upcoming}</span></p>
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Cleaner supply tracking</h2>
              <div className="mt-3 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
                <p>New applicants (today): <span className="font-semibold">{data.cleanerSupply.newApplicantsToday}</span></p>
                <p>Approved cleaners: <span className="font-semibold">{data.cleanerSupply.approvedCleaners}</span></p>
                <p>Active cleaners: <span className="font-semibold">{data.cleanerSupply.activeCleaners}</span></p>
                <p className="pt-1 text-xs text-emerald-700 dark:text-emerald-400">Earn up to R500/day</p>
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Cleaner acquisition funnel</h2>
              <p className="mt-1 text-xs text-zinc-500">Apply → Approve → Receive jobs → Earn</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <FunnelStep label="Apply" value={data.cleanerSupply.funnel.applied} pct={100} />
                <FunnelStep
                  label="Approve"
                  value={data.cleanerSupply.funnel.approved}
                  pct={pct(data.cleanerSupply.funnel.approved, Math.max(1, data.cleanerSupply.funnel.applied))}
                />
                <FunnelStep
                  label="Receive jobs"
                  value={data.cleanerSupply.funnel.receivingJobs}
                  pct={pct(data.cleanerSupply.funnel.receivingJobs, Math.max(1, data.cleanerSupply.funnel.approved))}
                />
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Supply vs demand</h2>
              <div className="mt-3 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
                <p>Active bookings (demand): <span className="font-semibold">{data.supplyDemand.demand}</span></p>
                <p>Available cleaners (supply): <span className="font-semibold">{data.supplyDemand.supply}</span></p>
                <p>Demand / Supply: <span className="font-semibold">{data.supplyDemand.ratio ?? "∞"}</span></p>
                <p>Avg surge multiplier: <span className="font-semibold">x{data.supplyDemand.avgSurgeMultiplier.toFixed(2)}</span></p>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Dispatch performance</h2>
              <div className="mt-3 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
                <p>Avg time to assign: <span className="font-semibold">{data.dispatch.avgAssignMinutes} min</span></p>
                <p>Acceptance rate: <span className="font-semibold">{data.dispatch.acceptanceRate}%</span></p>
                <p>Failed dispatch %: <span className="font-semibold">{data.dispatch.failedDispatchPct}%</span></p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Top insights</h2>
            {data.insights.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">No insights yet — data will appear as bookings and offers grow.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
                {data.insights.map((ins) => (
                  <li key={ins} className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/60">
                    {ins}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <p className="text-sm text-zinc-500">No analytics data available yet.</p>
      )}
    </main>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">{value}</p>
    </div>
  );
}

function FunnelStep({ label, value, pct }: { label: string; value: number; pct: number }) {
  return (
    <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800/60">
      <p className="font-semibold text-zinc-900 dark:text-zinc-50">{value}</p>
      <p className="text-zinc-500">{label}</p>
      <p className="text-zinc-400">{pct}%</p>
    </div>
  );
}

function pct(a: number, b: number): number {
  if (b <= 0) return 0;
  return Math.round((a / b) * 1000) / 10;
}
