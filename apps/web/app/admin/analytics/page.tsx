"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type FunnelPayload = {
  since?: string;
  rows?: number;
  sessions?: number;
  funnelStartSessions?: number;
  reachedPaymentSessions?: number;
  conversionRatePct?: number;
  dropOffByStep?: { step: string; viewed: number; dropped: number; dropOffPct: number }[];
  viewsByStep?: { step: string; views: number }[];
  topExitSteps?: { step: string; count: number }[];
  errorsByStep?: { step: string; count: number }[];
  message?: string;
};

type ChartStats = {
  revenueByDay?: { date: string; revenue: number }[];
  bookingsByDay?: { date: string; count: number }[];
  error?: string;
};

const FUNNEL_LABELS: Record<string, string> = {
  entry: "Entry",
  quote: "Quote",
  extras: "Extras (home + add-ons)",
  datetime: "Datetime",
  details: "Details (contact)",
  payment: "Payment",
};

export default function AdminAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [funnel, setFunnel] = useState<FunnelPayload | null>(null);
  const [charts, setCharts] = useState<ChartStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
      if (!token) {
        if (!cancelled) {
          setError("Sign in as admin.");
          setLoading(false);
        }
        return;
      }
      const [fRes, cRes] = await Promise.all([
        fetch("/api/admin/booking-funnel", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/admin/dashboard-stats", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const fJson = (await fRes.json()) as FunnelPayload & { error?: string };
      const cJson = (await cRes.json()) as ChartStats & { error?: string };
      if (cancelled) return;
      const errs: string[] = [];
      if (!fRes.ok) errs.push(fJson.error ?? "Funnel failed to load.");
      if (!cRes.ok) errs.push(cJson.error ?? "Charts failed to load.");
      setError(errs.length ? errs.join(" ") : null);
      setFunnel(fRes.ok ? fJson : null);
      setCharts(cRes.ok ? cJson : null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const revMax = useMemo(() => {
    const v = charts?.revenueByDay?.map((d) => d.revenue) ?? [];
    return v.length ? Math.max(...v, 1) : 1;
  }, [charts?.revenueByDay]);

  const bookMax = useMemo(() => {
    const v = charts?.bookingsByDay?.map((d) => d.count) ?? [];
    return v.length ? Math.max(...v, 1) : 1;
  }, [charts?.bookingsByDay]);

  const funnelStepsDisplay = useMemo(() => {
    const steps = ["quote", "extras", "datetime", "details", "payment"] as const;
    const views = new Map<string, number>();
    for (const row of funnel?.viewsByStep ?? []) {
      views.set(row.step, row.views);
    }
    return steps.map((step) => ({
      key: step,
      label: FUNNEL_LABELS[step] ?? step,
      viewed: step === "details" ? (views.get("details") ?? 0) : (views.get(step) ?? 0),
    }));
  }, [funnel?.viewsByStep]);

  return (
    <main className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Analytics</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Revenue and booking volume (30 days) plus conversion funnel from <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">booking_events</code>.
        </p>
      </div>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-56 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-56 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        </div>
      ) : error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </p>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Revenue (daily)</CardTitle>
                <CardDescription>Last 30 days, from paid bookings (created date).</CardDescription>
              </CardHeader>
              <CardContent>
                {(charts?.revenueByDay?.length ?? 0) === 0 ? (
                  <p className="text-sm text-zinc-500">No data.</p>
                ) : (
                  <svg viewBox="0 0 560 200" className="h-48 w-full">
                    <polyline
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      className="text-emerald-600"
                      points={(charts?.revenueByDay ?? [])
                        .map((d, i, arr) => {
                          const x = (i / Math.max(1, arr.length - 1)) * 540 + 10;
                          const y = 180 - (d.revenue / revMax) * 160;
                          return `${x},${y}`;
                        })
                        .join(" ")}
                    />
                  </svg>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Bookings per day</CardTitle>
                <CardDescription>Count of booking rows created per day.</CardDescription>
              </CardHeader>
              <CardContent>
                {(charts?.bookingsByDay?.length ?? 0) === 0 ? (
                  <p className="text-sm text-zinc-500">No data.</p>
                ) : (
                  <svg viewBox="0 0 560 200" className="h-48 w-full">
                    <polyline
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      className="text-blue-600"
                      points={(charts?.bookingsByDay ?? [])
                        .map((d, i, arr) => {
                          const x = (i / Math.max(1, arr.length - 1)) * 540 + 10;
                          const y = 180 - (d.count / bookMax) * 160;
                          return `${x},${y}`;
                        })
                        .join(" ")}
                    />
                  </svg>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Conversion funnel</CardTitle>
              <CardDescription>
                Product flow: quote → extras → datetime → details → payment. Tracked labels map to: quote, extras (details
                step), datetime, payment; &quot;details&quot; is reserved for a future dedicated contact step.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2 text-center text-xs">
                {funnelStepsDisplay.map((s) => (
                  <div key={s.key} className="min-w-[100px] flex-1 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/60">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-50">{s.viewed ?? "—"}</p>
                    <p className="mt-1 text-zinc-500">{s.label}</p>
                  </div>
                ))}
              </div>
              {funnel?.message ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-50">
                  {funnel.message}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Drop-off between steps</CardTitle>
                <CardDescription>Share of sessions that viewed a step but not the next in the funnel.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {(funnel?.dropOffByStep ?? []).map((row) => (
                    <li
                      key={row.step}
                      className="flex justify-between gap-2 border-b border-zinc-100 py-2 last:border-0 dark:border-zinc-800"
                    >
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                        {FUNNEL_LABELS[row.step] ?? row.step}
                      </span>
                      <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
                        {row.dropOffPct}% ({row.dropped}/{row.viewed})
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Exits & errors</CardTitle>
                <CardDescription>From booking_events (30d).</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase text-zinc-500">Exit events</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {(funnel?.topExitSteps ?? []).map((r) => (
                      <li key={r.step} className="flex justify-between gap-2">
                        <span>{FUNNEL_LABELS[r.step] ?? r.step}</span>
                        <span className="tabular-nums text-zinc-500">{r.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-zinc-500">Errors</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {(funnel?.errorsByStep ?? []).map((r) => (
                      <li key={r.step} className="flex justify-between gap-2">
                        <span>{FUNNEL_LABELS[r.step] ?? r.step}</span>
                        <span className="tabular-nums text-zinc-500">{r.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-zinc-500">
            Funnel rows: {funnel?.rows ?? 0} · Sessions: {funnel?.sessions ?? 0} · Quote→checkout conversion:{" "}
            {funnel?.conversionRatePct ?? 0}%
          </p>
        </>
      )}
    </main>
  );
}
