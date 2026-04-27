"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type RangeDays = 7 | 30 | 90;

type PaymentFunnel = {
  since: string;
  payment_link_first_sent: number;
  cohort_paid: number;
  cohort_payment_conversion_rate: number;
  pending_payment_with_link: number;
};

type ChannelStats = {
  sample_size: number;
  whatsapp_success_rate: number | null;
  sms_fallback_rate: number | null;
  email_only_rate: number | null;
  email_attempted: number;
  email_success_rate: number | null;
  sms_fallback_after_email_failed_rate: number | null;
};

type VariantRow = {
  name: string;
  sends: number;
  conversions: number;
  conversion: number;
  revenue_cents: number;
  revenue_per_send: number;
  composite_score: number;
};

type ExperimentRow = { experiment: string; variants: VariantRow[] };

type GrowthRow = {
  action_type: string;
  channel: string;
  sends: number;
  conversions: number;
  conversion_rate: number;
  total_revenue_cents: number;
};

type RolloutSuggestion = {
  experiment_key: string;
  from_variant: string;
  to_variant: string;
  suggested_rollout_delta: number;
  reason: string;
};

type TrendDayPoint = {
  date: string;
  first_sent: number;
  paid: number;
  conversion_rate: number;
};

type EmailTrendDayPoint = {
  date: string;
  attempted: number;
  sent: number;
  success_rate: number;
};

type ConversionTrendPack = {
  funnel_by_day: TrendDayPoint[];
  email_channel_by_day: EmailTrendDayPoint[];
  summary: {
    last_7d: { first_sent: number; paid: number; conversion_rate: number };
    prior_7d: { first_sent: number; paid: number; conversion_rate: number };
    conversion_delta_pct_points: number | null;
  };
};

type FunnelSegmentRow = {
  key: string;
  label: string;
  first_sent: number;
  paid: number;
  conversion_rate: number;
};

type FunnelSegmentBreakdown = {
  by_city: FunnelSegmentRow[];
  by_account: FunnelSegmentRow[];
};

type ConversionAlert = {
  severity: "warning" | "critical";
  code: string;
  message: string;
};

type DrillRow = {
  booking_id: string;
  variant: string;
  exposure_at: string;
  status: string;
  customer_email: string | null;
  payment_completed_at: string | null;
  city_id: string | null;
  payment_link_first_sent_at: string | null;
};

type DashboardPayload = {
  since: string;
  payment_funnel: PaymentFunnel;
  payment_delivery_stats: ChannelStats;
  experiments: ExperimentRow[];
  rollout_suggestions: RolloutSuggestion[];
  rollout_guards: Record<string, number>;
  growth_rows: GrowthRow[];
  trends?: ConversionTrendPack;
  week_over_week?: {
    last_7d: { first_sent: number; paid: number; conversion_rate: number };
    prior_7d: { first_sent: number; paid: number; conversion_rate: number };
  };
  segments?: FunnelSegmentBreakdown;
  alerts?: ConversionAlert[];
  error?: string;
};

function pct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function moneyZarFromCents(cents: number): string {
  const z = cents / 100;
  return `R ${Math.round(z).toLocaleString("en-ZA")}`;
}

function sinceIsoForRange(days: RangeDays): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function sliceTrendDays<T extends { date: string }>(days: T[], lastN: number): T[] {
  if (days.length <= lastN) return days;
  return days.slice(days.length - lastN);
}

function MiniBars<T extends { date: string }>({
  points,
  height,
  getValue,
  colorClass,
}: {
  points: T[];
  height: number;
  getValue: (p: T) => number;
  colorClass: string;
}) {
  const vals = points.map(getValue);
  const max = Math.max(...vals, 1);
  return (
    <div className="flex items-end gap-px" style={{ height }}>
      {points.map((p, i) => {
        const v = getValue(p);
        const h = Math.round((v / max) * (height - 4)) + 2;
        return (
          <div
            key={`${p.date}-${i}`}
            className="min-w-0 flex-1 rounded-t bg-zinc-200 dark:bg-zinc-700"
            title={`${p.date}: ${v}`}
          >
            <div className={`mx-auto w-full max-w-[10px] rounded-t ${colorClass}`} style={{ height: h }} />
          </div>
        );
      })}
    </div>
  );
}

export default function AdminConversionDashboardPage() {
  const [range, setRange] = useState<RangeDays>(30);
  const [trendDays, setTrendDays] = useState<7 | 30>(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [drillKey, setDrillKey] = useState<string | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillRows, setDrillRows] = useState<DrillRow[] | null>(null);

  const load = useCallback(async (days: RangeDays) => {
    setLoading(true);
    setError(null);
    const sb = getSupabaseBrowser();
    const session = await sb?.auth.getSession();
    const token = session?.data.session?.access_token;
    if (!token) {
      setError("Please sign in as admin.");
      setLoading(false);
      return;
    }
    const since = sinceIsoForRange(days);
    const res = await fetch(`/api/admin/conversion-dashboard?since=${encodeURIComponent(since)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as DashboardPayload & { error?: string };
    if (!res.ok) {
      setError(json.error ?? "Failed to load conversion dashboard.");
      setLoading(false);
      return;
    }
    setData(json);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(range);
  }, [range, load]);

  const openDrill = useCallback(
    async (experimentKey: string) => {
      setDrillKey(experimentKey);
      setDrillLoading(true);
      setDrillRows(null);
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
      if (!token) {
        setDrillLoading(false);
        return;
      }
      const res = await fetch(
        `/api/admin/conversion-experiment-bookings?experiment_key=${encodeURIComponent(experimentKey)}&limit=50`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const json = (await res.json()) as { rows?: DrillRow[]; error?: string };
      setDrillRows(json.rows ?? []);
      setDrillLoading(false);
    },
    [],
  );

  const rangeLabel = useMemo(() => `${range} days`, [range]);

  const funnelTrendSlice = useMemo(() => {
    const fb = data?.trends?.funnel_by_day ?? [];
    return sliceTrendDays(fb, trendDays);
  }, [data?.trends?.funnel_by_day, trendDays]);

  const emailTrendSlice = useMemo(() => {
    const eb = data?.trends?.email_channel_by_day ?? [];
    return sliceTrendDays(eb, trendDays);
  }, [data?.trends?.email_channel_by_day, trendDays]);

  return (
    <main className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Conversion & experiments
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Payment-link funnel, channel health, A/B performance, trends (7/30-day), segment splits, and alerts.
            Main KPI window follows the selector; trends always include the last 30 days of daily series (slice
            below).
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {([7, 30, 90] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setRange(d)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                range === d
                  ? "bg-blue-600 text-white"
                  : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
          ))}
        </div>
      ) : error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </p>
      ) : data ? (
        <>
          {data.alerts && data.alerts.length > 0 ? (
            <section className="space-y-2" aria-label="Alerts">
              {data.alerts.map((a) => (
                <div
                  key={a.code + a.message.slice(0, 24)}
                  className={`rounded-xl border px-4 py-3 text-sm ${
                    a.severity === "critical"
                      ? "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-100"
                      : "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                  }`}
                >
                  <span className="font-semibold">{a.severity === "critical" ? "Critical" : "Warning"}</span>
                  <span className="ml-2 font-mono text-xs opacity-80">{a.code}</span>
                  <p className="mt-1 text-zinc-800 dark:text-zinc-200">{a.message}</p>
                </div>
              ))}
            </section>
          ) : null}

          {data.week_over_week ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Week-over-week cohort (exact counts)</CardTitle>
                <CardDescription>
                  Last 7 days vs previous 7 days — same definition as funnel (first send in window → paid).
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 text-sm">
                <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">Last 7d</p>
                  <p className="mt-1 tabular-nums text-zinc-600 dark:text-zinc-300">
                    Sent {data.week_over_week.last_7d.first_sent.toLocaleString("en-ZA")} · Paid{" "}
                    {data.week_over_week.last_7d.paid.toLocaleString("en-ZA")} ·{" "}
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                      {pct(data.week_over_week.last_7d.conversion_rate)}
                    </span>
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">Prior 7d</p>
                  <p className="mt-1 tabular-nums text-zinc-600 dark:text-zinc-300">
                    Sent {data.week_over_week.prior_7d.first_sent.toLocaleString("en-ZA")} · Paid{" "}
                    {data.week_over_week.prior_7d.paid.toLocaleString("en-ZA")} ·{" "}
                    <span className="font-semibold">{pct(data.week_over_week.prior_7d.conversion_rate)}</span>
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {data.trends && data.trends.funnel_by_day.length > 0 ? (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Daily trends
                </h3>
                <div className="flex gap-2">
                  {([7, 30] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setTrendDays(n)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                        trendDays === n
                          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                          : "border border-zinc-300 text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
                      }`}
                    >
                      Last {n}d
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Payment volume (first send / day)</CardTitle>
                    <CardDescription>{trendDays}-day window · bar height = relative volume</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="mb-1 text-xs font-medium text-zinc-500">First-send volume</p>
                      <MiniBars<TrendDayPoint>
                        points={funnelTrendSlice}
                        height={112}
                        getValue={(p) => p.first_sent}
                        colorClass="bg-blue-500 dark:bg-blue-400"
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium text-zinc-500">Paid (same calendar day as send · approx.)</p>
                      <MiniBars<TrendDayPoint>
                        points={funnelTrendSlice}
                        height={72}
                        getValue={(p) => p.paid}
                        colorClass="bg-emerald-500 dark:bg-emerald-400"
                      />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Email channel (events / day)</CardTitle>
                    <CardDescription>Success rate trend from delivery events</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <MiniBars<EmailTrendDayPoint>
                      points={emailTrendSlice}
                      height={112}
                      getValue={(p) => p.success_rate}
                      colorClass="bg-violet-500 dark:bg-violet-400"
                    />
                    <p className="mt-2 text-xs text-zinc-500">
                      Row-based trend; correlate with experiments and template changes.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </section>
          ) : null}

          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Payment funnel ({rangeLabel})
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Links sent</CardTitle>
                  <CardDescription>First payment-link send in window</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                    {data.payment_funnel.payment_link_first_sent.toLocaleString("en-ZA")}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Paid (cohort)</CardTitle>
                  <CardDescription>Same cohort completed payment</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                    {data.payment_funnel.cohort_paid.toLocaleString("en-ZA")}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Cohort conversion</CardTitle>
                  <CardDescription>Paid ÷ first-sent</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {pct(data.payment_funnel.cohort_payment_conversion_rate)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Open pipeline</CardTitle>
                  <CardDescription>Pending + link on file (snapshot)</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold tabular-nums text-amber-800 dark:text-amber-300">
                    {data.payment_funnel.pending_payment_with_link.toLocaleString("en-ZA")}
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>

          {data.segments ? (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Segment view ({rangeLabel})
              </h3>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">By city</CardTitle>
                    <CardDescription>First-send cohort in window (capped sample)</CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-x-auto text-sm">
                    <table className="w-full min-w-[320px]">
                      <thead>
                        <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-700">
                          <th className="py-2 pr-2">City</th>
                          <th className="py-2 pr-2">Sent</th>
                          <th className="py-2 pr-2">Paid</th>
                          <th className="py-2">Conv.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.segments.by_city.map((r) => (
                          <tr key={r.key} className="border-b border-zinc-100 dark:border-zinc-800">
                            <td className="py-2 pr-2">{r.label}</td>
                            <td className="py-2 pr-2 tabular-nums">{r.first_sent}</td>
                            <td className="py-2 pr-2 tabular-nums">{r.paid}</td>
                            <td className="py-2 tabular-nums">{pct(r.conversion_rate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">New vs signed-in</CardTitle>
                    <CardDescription>Guest (no user_id) vs account holder</CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-x-auto text-sm">
                    <table className="w-full min-w-[280px]">
                      <thead>
                        <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-700">
                          <th className="py-2 pr-2">Segment</th>
                          <th className="py-2 pr-2">Sent</th>
                          <th className="py-2 pr-2">Paid</th>
                          <th className="py-2">Conv.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.segments.by_account.map((r) => (
                          <tr key={r.key} className="border-b border-zinc-100 dark:border-zinc-800">
                            <td className="py-2 pr-2">{r.label}</td>
                            <td className="py-2 pr-2 tabular-nums">{r.first_sent}</td>
                            <td className="py-2 pr-2 tabular-nums">{r.paid}</td>
                            <td className="py-2 tabular-nums">{pct(r.conversion_rate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </div>
            </section>
          ) : null}

          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Channel health (recent sample)
            </h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Email success</CardTitle>
                  <CardDescription>
                    {data.payment_delivery_stats.email_attempted} attempts in sample
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                    {pct(data.payment_delivery_stats.email_success_rate)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">SMS after email fail</CardTitle>
                  <CardDescription>Recovery when email did not send</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                    {pct(data.payment_delivery_stats.sms_fallback_after_email_failed_rate)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Telemetry sample</CardTitle>
                  <CardDescription>Bookings with delivery JSON</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                    {data.payment_delivery_stats.sample_size}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Email-only success share: {pct(data.payment_delivery_stats.email_only_rate)}
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Experiments ({rangeLabel})
            </h3>
            {data.experiments.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-zinc-500">
                  No experiment exposures in this window yet.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {data.experiments.map((exp) => (
                  <Card key={exp.experiment}>
                    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                      <div>
                        <CardTitle className="font-mono text-base">{exp.experiment}</CardTitle>
                        <CardDescription>Exposures, conversions, revenue per variant</CardDescription>
                      </div>
                      <button
                        type="button"
                        onClick={() => void openDrill(exp.experiment)}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                      >
                        View recent bookings
                      </button>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                      <table className="w-full min-w-[640px] border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                            <th className="py-2 pr-4 font-medium">Variant</th>
                            <th className="py-2 pr-4 font-medium">Sends</th>
                            <th className="py-2 pr-4 font-medium">Conv.</th>
                            <th className="py-2 pr-4 font-medium">Rate</th>
                            <th className="py-2 pr-4 font-medium">Revenue</th>
                            <th className="py-2 pr-4 font-medium">Rev / send</th>
                            <th className="py-2 font-medium">Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {exp.variants.map((v) => (
                            <tr
                              key={v.name}
                              className="border-b border-zinc-100 dark:border-zinc-800/80"
                            >
                              <td className="py-2 pr-4 font-mono text-zinc-900 dark:text-zinc-100">{v.name}</td>
                              <td className="py-2 pr-4 tabular-nums">{v.sends}</td>
                              <td className="py-2 pr-4 tabular-nums">{v.conversions}</td>
                              <td className="py-2 pr-4 tabular-nums">{pct(v.conversion)}</td>
                              <td className="py-2 pr-4 tabular-nums">{moneyZarFromCents(v.revenue_cents)}</td>
                              <td className="py-2 pr-4 tabular-nums text-zinc-600 dark:text-zinc-300">
                                {moneyZarFromCents(Math.round(v.revenue_per_send))}
                              </td>
                              <td className="py-2 tabular-nums text-zinc-600 dark:text-zinc-300">
                                {v.composite_score.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Auto-rollout suggestions</CardTitle>
                <CardDescription>
                  Guards: ≥{data.rollout_guards.min_total_exposures} total exposures, ≥
                  {data.rollout_guards.min_per_arm} per arm, &gt;{(data.rollout_guards.min_conversion_lead * 100).toFixed(0)}pp
                  conv. lead, revenue score ≥ {(data.rollout_guards.min_revenue_score_ratio * 100).toFixed(0)}% of control.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.rollout_suggestions.length === 0 ? (
                  <p className="text-sm text-zinc-500">No eligible suggestions right now.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {data.rollout_suggestions.map((s) => (
                      <li
                        key={s.experiment_key}
                        className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/50"
                      >
                        <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">
                          {s.experiment_key}
                        </span>
                        <span className="text-zinc-600 dark:text-zinc-400">
                          {" "}
                          → +{s.suggested_rollout_delta}% to {s.to_variant}
                        </span>
                        <p className="mt-1 text-xs text-zinc-500">{s.reason}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Growth campaigns ({rangeLabel})</CardTitle>
                <CardDescription>From growth_action_outcomes</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {data.growth_rows.length === 0 ? (
                  <p className="text-sm text-zinc-500">No growth sends in this window.</p>
                ) : (
                  <table className="w-full min-w-[480px] text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-700">
                        <th className="py-2 pr-3 font-medium">Action</th>
                        <th className="py-2 pr-3 font-medium">Channel</th>
                        <th className="py-2 pr-3 font-medium">Sends</th>
                        <th className="py-2 pr-3 font-medium">Conv.</th>
                        <th className="py-2 font-medium">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.growth_rows.map((g) => (
                        <tr key={`${g.action_type}-${g.channel}`} className="border-b border-zinc-100 dark:border-zinc-800">
                          <td className="py-2 pr-3 font-mono text-xs">{g.action_type}</td>
                          <td className="py-2 pr-3">{g.channel}</td>
                          <td className="py-2 pr-3 tabular-nums">{g.sends}</td>
                          <td className="py-2 pr-3 tabular-nums">{pct(g.conversion_rate)}</td>
                          <td className="py-2 tabular-nums">{moneyZarFromCents(g.total_revenue_cents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </section>

          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            APIs:{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">GET /api/admin/conversion-dashboard</code> ·{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">GET /api/admin/conversion-experiment-bookings</code>{" "}
            ·{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">GET /api/admin/conversion-experiments</code>
          </p>

          {drillKey ? (
            <div
              className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
              role="dialog"
              aria-modal="true"
              aria-label="Experiment bookings"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setDrillKey(null);
                  setDrillRows(null);
                }
              }}
            >
              <div className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
                  <h3 className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-50">{drillKey}</h3>
                  <button
                    type="button"
                    className="rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    onClick={() => {
                      setDrillKey(null);
                      setDrillRows(null);
                    }}
                  >
                    Close
                  </button>
                </div>
                <div className="max-h-[calc(85vh-52px)] overflow-auto p-4">
                  {drillLoading ? (
                    <p className="text-sm text-zinc-500">Loading…</p>
                  ) : drillRows && drillRows.length ? (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-600">
                          <th className="py-2 pr-2">Booking</th>
                          <th className="py-2 pr-2">Variant</th>
                          <th className="py-2 pr-2">Status</th>
                          <th className="py-2 pr-2">Paid</th>
                          <th className="py-2">Exposure</th>
                        </tr>
                      </thead>
                      <tbody>
                        {drillRows.map((r) => (
                          <tr key={r.booking_id + r.exposure_at} className="border-b border-zinc-100 dark:border-zinc-800">
                            <td className="py-2 pr-2">
                              <Link
                                href={`/admin/bookings/${encodeURIComponent(r.booking_id)}`}
                                className="font-mono text-blue-600 underline dark:text-blue-400"
                              >
                                {r.booking_id.slice(0, 8)}…
                              </Link>
                            </td>
                            <td className="py-2 pr-2 font-mono">{r.variant}</td>
                            <td className="py-2 pr-2">{r.status}</td>
                            <td className="py-2 pr-2">{r.payment_completed_at ? "Yes" : "—"}</td>
                            <td className="py-2 text-zinc-500">{r.exposure_at.slice(0, 16)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-sm text-zinc-500">No rows.</p>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
