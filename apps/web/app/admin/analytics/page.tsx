"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type FunnelPayload = {
  since?: string;
  rows?: number;
  sessions?: number;
  sessionsWithFunnelView?: number;
  funnelStartSessions?: number;
  reachedPaymentSessions?: number;
  conversionRatePct?: number;
  dropOffByStep?: { step: string; viewed: number; dropped: number; dropOffPct: number }[];
  viewsByStep?: { step: string; views: number }[];
  topExitSteps?: { step: string; count: number }[];
  errorsByStep?: { step: string; count: number }[];
  intelligence?: {
    stepConversion?: { from: string; to: string; viewed: number; progressed: number; conversionPct: number; dropOffPct: number }[];
    timeToComplete?: { completedSessions: number; avgSeconds: number | null; medianSeconds: number | null };
    deviceBreakdown?: SegmentRow[];
    serviceBreakdown?: SegmentRow[];
    areaBreakdown?: SegmentRow[];
    cleanerSelectionRatePct?: number;
    addOnAttachRatePct?: number;
    paystack?: { opened: number; completed: number; abandonmentPct: number };
    dailyTrends?: DailyTrendRow[];
    cohortAnalysis?: CohortRow[];
    revenue?: { paidBookings: number; totalZar: number };
    operational?: {
      cleanerDemandForecast?: {
        peakDays?: DemandRow[];
        highDemandSuburbs?: DemandRow[];
        timeSlotDemand?: DemandRow[];
      };
      pricingIntelligence?: {
        highConvertingPrices?: PriceIntelligenceRow[];
        lowConvertingServices?: SegmentRow[];
        bestUpsellCombinations?: UpsellCombinationRow[];
      };
    };
  };
  message?: string;
};

type SegmentRow = {
  label: string;
  starts: number;
  reachedPayment: number;
  completed: number;
  conversionPct: number;
  addOnAttachPct: number;
};

type CohortRow = SegmentRow & { cohort: string };

type DemandRow = {
  label: string;
  bookingStarts: number;
  timeSelections: number;
  completed: number;
  paidBookings: number;
  revenueZar: number;
  demandScore: number;
  conversionPct: number;
};

type PriceIntelligenceRow = {
  label: string;
  starts: number;
  reachedPayment: number;
  completed: number;
  conversionPct: number;
  paymentReachPct: number;
  revenueZar: number;
};

type UpsellCombinationRow = {
  combo: string;
  starts: number;
  completed: number;
  conversionPct: number;
  revenueZar: number;
};

type DailyTrendRow = {
  date: string;
  starts: number;
  reachedPayment: number;
  completed: number;
  bookings: number;
  paystackAbandons: number;
  conversionPct: number;
  paymentReachPct: number;
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

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round((minutes / 60) * 10) / 10}h`;
}

function pctLabel(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? "—" : `${value.toFixed(1)}%`;
}

function zarLabel(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `R ${Math.round(value).toLocaleString("en-ZA")}`;
}

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

  const trendMax = useMemo(() => {
    const values = (funnel?.intelligence?.dailyTrends ?? []).flatMap((d) => [d.starts, d.completed, d.bookings]);
    return values.length ? Math.max(...values, 1) : 1;
  }, [funnel?.intelligence?.dailyTrends]);

  return (
    <main className="mx-auto max-w-6xl space-y-8">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Analytics</h2>
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Step conversion</CardTitle>
                <CardDescription>Quote to checkout</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{pctLabel(funnel?.conversionRatePct)}</p>
                <p className="mt-1 text-xs text-zinc-500">{funnel?.funnelStartSessions ?? 0} started sessions</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Time to complete</CardTitle>
                <CardDescription>Median completed session</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                  {formatDuration(funnel?.intelligence?.timeToComplete?.medianSeconds)}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Avg {formatDuration(funnel?.intelligence?.timeToComplete?.avgSeconds)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Cleaner selection</CardTitle>
                <CardDescription>Validates auto-assign</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                  {pctLabel(funnel?.intelligence?.cleanerSelectionRatePct)}
                </p>
                <p className="mt-1 text-xs text-zinc-500">Manual chooser usage</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Paystack abandonment</CardTitle>
                <CardDescription>Opened but not completed</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                  {pctLabel(funnel?.intelligence?.paystack?.abandonmentPct)}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {funnel?.intelligence?.paystack?.completed ?? 0}/{funnel?.intelligence?.paystack?.opened ?? 0} completed
                </p>
              </CardContent>
            </Card>
          </div>

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

          <Card>
            <CardHeader>
              <CardTitle>Daily funnel intelligence</CardTitle>
              <CardDescription>Conversion trend, booking trend, and Paystack abandonment spikes over the last 30 days.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(funnel?.intelligence?.dailyTrends?.length ?? 0) === 0 ? (
                <p className="text-sm text-zinc-500">No trend data yet.</p>
              ) : (
                <>
                  <div className="flex h-44 items-end gap-1">
                    {(funnel?.intelligence?.dailyTrends ?? []).map((d) => (
                      <div key={d.date} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${d.date}: ${d.starts} starts, ${d.completed} completed, ${d.paystackAbandons} Paystack abandons`}>
                        <div
                          className="w-full max-w-[12px] rounded-t bg-rose-400"
                          style={{ height: `${Math.max(2, (d.paystackAbandons / trendMax) * 140)}px` }}
                        />
                        <div
                          className="w-full max-w-[12px] rounded-t bg-emerald-500"
                          style={{ height: `${Math.max(2, (d.completed / trendMax) * 140)}px` }}
                        />
                        <div
                          className="w-full max-w-[12px] rounded-t bg-blue-500"
                          style={{ height: `${Math.max(2, (d.starts / trendMax) * 140)}px` }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
                    <span><span className="inline-block h-2 w-2 rounded-full bg-blue-500" /> Starts</span>
                    <span><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Completed</span>
                    <span><span className="inline-block h-2 w-2 rounded-full bg-rose-400" /> Paystack abandons</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Operational intelligence</CardTitle>
              <CardDescription>
                Cleaner demand forecasting from selected dates, selected time slots, suburb demand, and paid booking rows.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 lg:grid-cols-3">
                {[
                  ["Peak days", funnel?.intelligence?.operational?.cleanerDemandForecast?.peakDays ?? []],
                  ["High-demand suburbs", funnel?.intelligence?.operational?.cleanerDemandForecast?.highDemandSuburbs ?? []],
                  ["Time slot demand", funnel?.intelligence?.operational?.cleanerDemandForecast?.timeSlotDemand ?? []],
                ].map(([title, rows]) => (
                  <div key={String(title)} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{String(title)}</h3>
                    <ul className="mt-3 space-y-2 text-sm">
                      {(rows as DemandRow[]).length === 0 ? (
                        <li className="text-zinc-500">No signal yet.</li>
                      ) : (
                        (rows as DemandRow[]).map((row) => (
                          <li key={row.label} className="space-y-1 border-b border-zinc-100 pb-2 last:border-0 dark:border-zinc-800">
                            <div className="flex justify-between gap-2">
                              <span className="font-medium text-zinc-800 dark:text-zinc-200">{row.label}</span>
                              <span className="tabular-nums text-zinc-600 dark:text-zinc-400">Score {row.demandScore}</span>
                            </div>
                            <p className="text-xs text-zinc-500">
                              {row.timeSelections} time picks · {row.paidBookings} paid · {zarLabel(row.revenueZar)}
                            </p>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pricing intelligence</CardTitle>
              <CardDescription>
                Price buckets, low-converting services, and upsell combinations from booking event payloads.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">High-converting prices</h3>
                  <ul className="mt-3 space-y-2 text-sm">
                    {(funnel?.intelligence?.operational?.pricingIntelligence?.highConvertingPrices ?? []).length === 0 ? (
                      <li className="text-zinc-500">No price signal yet.</li>
                    ) : (
                      (funnel?.intelligence?.operational?.pricingIntelligence?.highConvertingPrices ?? []).map((row) => (
                        <li key={row.label} className="space-y-1 border-b border-zinc-100 pb-2 last:border-0 dark:border-zinc-800">
                          <div className="flex justify-between gap-2">
                            <span className="font-medium text-zinc-800 dark:text-zinc-200">{row.label}</span>
                            <span className="tabular-nums text-zinc-600 dark:text-zinc-400">{pctLabel(row.conversionPct)}</span>
                          </div>
                          <p className="text-xs text-zinc-500">
                            {row.completed}/{row.starts} completed · {pctLabel(row.paymentReachPct)} reached payment
                          </p>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Low-converting services</h3>
                  <ul className="mt-3 space-y-2 text-sm">
                    {(funnel?.intelligence?.operational?.pricingIntelligence?.lowConvertingServices ?? []).length === 0 ? (
                      <li className="text-zinc-500">No service signal yet.</li>
                    ) : (
                      (funnel?.intelligence?.operational?.pricingIntelligence?.lowConvertingServices ?? []).map((row) => (
                        <li key={row.label} className="space-y-1 border-b border-zinc-100 pb-2 last:border-0 dark:border-zinc-800">
                          <div className="flex justify-between gap-2">
                            <span className="font-medium text-zinc-800 dark:text-zinc-200">{row.label}</span>
                            <span className="tabular-nums text-zinc-600 dark:text-zinc-400">{pctLabel(row.conversionPct)}</span>
                          </div>
                          <p className="text-xs text-zinc-500">
                            {row.completed}/{row.starts} completed · {pctLabel(row.addOnAttachPct)} add-ons
                          </p>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Best upsell combinations</h3>
                  <ul className="mt-3 space-y-2 text-sm">
                    {(funnel?.intelligence?.operational?.pricingIntelligence?.bestUpsellCombinations ?? []).length === 0 ? (
                      <li className="text-zinc-500">No add-on signal yet.</li>
                    ) : (
                      (funnel?.intelligence?.operational?.pricingIntelligence?.bestUpsellCombinations ?? []).map((row) => (
                        <li key={row.combo} className="space-y-1 border-b border-zinc-100 pb-2 last:border-0 dark:border-zinc-800">
                          <div className="flex justify-between gap-2">
                            <span className="font-medium text-zinc-800 dark:text-zinc-200">{row.combo}</span>
                            <span className="tabular-nums text-zinc-600 dark:text-zinc-400">{pctLabel(row.conversionPct)}</span>
                          </div>
                          <p className="text-xs text-zinc-500">
                            {row.completed}/{row.starts} completed
                          </p>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
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
                  {(funnel?.intelligence?.stepConversion ?? []).map((row) => (
                    <li
                      key={`${row.from}-${row.to}`}
                      className="flex justify-between gap-2 border-b border-zinc-100 py-2 last:border-0 dark:border-zinc-800"
                    >
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                        {FUNNEL_LABELS[row.from] ?? row.from} → {FUNNEL_LABELS[row.to] ?? row.to}
                      </span>
                      <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
                        {pctLabel(row.conversionPct)} conversion · {pctLabel(row.dropOffPct)} drop
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

          <div className="grid gap-4 lg:grid-cols-3">
            {[
              ["Mobile vs desktop", funnel?.intelligence?.deviceBreakdown ?? []],
              ["Service conversion", funnel?.intelligence?.serviceBreakdown ?? []],
              ["Area drop-offs", funnel?.intelligence?.areaBreakdown ?? []],
            ].map(([title, rows]) => (
              <Card key={String(title)}>
                <CardHeader>
                  <CardTitle>{String(title)}</CardTitle>
                  <CardDescription>Starts, completed bookings, and add-on attach rate.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {(rows as SegmentRow[]).length === 0 ? (
                      <li className="text-zinc-500">No data yet.</li>
                    ) : (
                      (rows as SegmentRow[]).map((row) => (
                        <li key={row.label} className="space-y-1 border-b border-zinc-100 pb-2 last:border-0 dark:border-zinc-800">
                          <div className="flex justify-between gap-2">
                            <span className="font-medium text-zinc-800 dark:text-zinc-200">{row.label}</span>
                            <span className="tabular-nums text-zinc-600 dark:text-zinc-400">{pctLabel(row.conversionPct)}</span>
                          </div>
                          <p className="text-xs text-zinc-500">
                            {row.completed}/{row.starts} completed · {pctLabel(row.addOnAttachPct)} add-ons
                          </p>
                        </li>
                      ))
                    )}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Cohort analysis</CardTitle>
              <CardDescription>Automatically highlights cohorts like Deep Cleaning, mobile users, and Sea Point users.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500 dark:border-zinc-800">
                    <tr>
                      <th className="py-2 pr-4 font-semibold">Cohort</th>
                      <th className="py-2 pr-4 font-semibold">Starts</th>
                      <th className="py-2 pr-4 font-semibold">Reached payment</th>
                      <th className="py-2 pr-4 font-semibold">Completed</th>
                      <th className="py-2 pr-4 font-semibold">Conversion</th>
                      <th className="py-2 font-semibold">Add-ons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(funnel?.intelligence?.cohortAnalysis ?? []).length === 0 ? (
                      <tr>
                        <td className="py-3 text-zinc-500" colSpan={6}>No cohort data yet.</td>
                      </tr>
                    ) : (
                      (funnel?.intelligence?.cohortAnalysis ?? []).map((row) => (
                        <tr key={row.cohort} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                          <td className="py-2 pr-4 font-medium text-zinc-800 dark:text-zinc-200">{row.cohort}</td>
                          <td className="py-2 pr-4 tabular-nums">{row.starts}</td>
                          <td className="py-2 pr-4 tabular-nums">{row.reachedPayment}</td>
                          <td className="py-2 pr-4 tabular-nums">{row.completed}</td>
                          <td className="py-2 pr-4 tabular-nums">{pctLabel(row.conversionPct)}</td>
                          <td className="py-2 tabular-nums">{pctLabel(row.addOnAttachPct)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <p className="text-xs text-zinc-500">
            Funnel rows: {funnel?.rows ?? 0} · Funnel view sessions:{" "}
            {funnel?.sessionsWithFunnelView ?? funnel?.sessions ?? 0} · Quote→checkout conversion:{" "}
            {funnel?.conversionRatePct ?? 0}%
          </p>
        </>
      )}
    </main>
  );
}
