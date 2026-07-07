"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminData } from "@/hooks/useAdminData";
import type { OfficeAnalyticsSummary } from "@/lib/admin/officeAnalytics";
import {
  AnalyticsDateRangePicker,
  type AnalyticsRange,
} from "@/components/admin/office/AnalyticsDateRangePicker";

function zar(value: number): string {
  return `R ${Math.round(value).toLocaleString("en-ZA")}`;
}

function defaultRange(): AnalyticsRange {
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from, to };
}

function rangeLabel(range: AnalyticsRange): string {
  const sameYear = range.from.getFullYear() === range.to.getFullYear();
  return `${format(range.from, sameYear ? "d MMM" : "d MMM yyyy")} – ${format(range.to, "d MMM yyyy")}`;
}

function formatTrend(pct: number | null): { text: string; dir: "up" | "down" } {
  if (pct == null) return { text: "—", dir: "up" };
  const sign = pct > 0 ? "+" : "";
  return { text: `${sign}${pct}%`, dir: pct >= 0 ? "up" : "down" };
}

function formatRetention(value: number | null): string {
  if (value == null) return "—";
  return `${value}%`;
}

export default function AnalyticsPage() {
  const [range, setRange] = useState<AnalyticsRange>(defaultRange);
  const params = useMemo(
    () => ({ from: format(range.from, "yyyy-MM-dd"), to: format(range.to, "yyyy-MM-dd") }),
    [range],
  );
  const { data, loading, error, refetch } = useAdminData<OfficeAnalyticsSummary>(
    "/api/admin/office-analytics",
    { params },
  );

  const chartData = useMemo(() => data?.revenueChart ?? [], [data]);
  const maxVal = useMemo(
    () => (chartData.length ? Math.max(...chartData.map((d) => d.value), 1) : 1),
    [chartData],
  );
  const chartTotal = useMemo(() => chartData.reduce((sum, d) => sum + d.value, 0), [chartData]);
  const currentRangeLabel = rangeLabel(range);

  const kpis = data
    ? [
        {
          label: "Total revenue",
          value: zar(data.kpis.totalRevenueZar),
          trend: formatTrend(data.kpis.totalRevenueTrendPct),
          icon: DollarSign,
          color: "bg-emerald-50 text-emerald-600",
        },
        {
          label: "Total bookings",
          value: String(data.kpis.totalBookings),
          trend: formatTrend(data.kpis.totalBookingsTrendPct),
          icon: BarChart3,
          color: "bg-blue-50 text-blue-600",
        },
        {
          label: "Avg booking value",
          value: zar(data.kpis.avgBookingValueZar),
          trend: formatTrend(data.kpis.avgBookingValueTrendPct),
          icon: TrendingUp,
          color: "bg-violet-50 text-violet-600",
        },
        {
          label: "Customer retention",
          value: formatRetention(data.kpis.customerRetentionPct),
          trend: formatTrend(data.kpis.customerRetentionTrendPct),
          icon: Users,
          color: "bg-orange-50 text-orange-600",
        },
      ]
    : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Business performance insights, revenue trends and customer metrics.
            {data?.fetchedAt ? (
              <span className="ml-1 text-slate-400">
                Updated {new Date(data.fetchedAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })} SAST.
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
          <AnalyticsDateRangePicker value={range} onChange={setRange} />
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Could not load analytics</p>
            <p className="mt-0.5 text-red-700">{error}</p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading && !data
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
            ))
          : kpis.map((k) => {
              const KIcon = k.icon;
              const [iconBg, iconColor] = k.color.split(" ");
              return (
                <div key={k.label} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
                      <p className="mt-1.5 text-2xl font-bold text-slate-900">{k.value}</p>
                      <div
                        className={cn(
                          "mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          k.trend.dir === "up" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600",
                        )}
                      >
                        {k.trend.dir === "up" ? (
                          <ArrowUpRight className="h-3 w-3" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3" />
                        )}
                        {k.trend.text}
                      </div>
                    </div>
                    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", iconBg)}>
                      <KIcon className={cn("h-5 w-5", iconColor)} />
                    </div>
                  </div>
                </div>
              );
            })}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">Revenue — {currentRangeLabel}</h3>
          <span className="text-xs text-slate-400">
            {loading && !data ? "Loading…" : `${zar(chartTotal)} total`}
          </span>
        </div>
        {loading && !data ? (
          <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
        ) : chartData.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">No paid revenue in this period yet.</p>
        ) : (
          <div className="flex h-40 gap-3">
            {chartData.map((d) => (
              <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1">
                <span className="shrink-0 text-[10px] text-slate-500">
                  {d.value >= 1000 ? `R${(d.value / 1000).toFixed(1)}k` : `R${Math.round(d.value)}`}
                </span>
                <div className="flex min-h-0 w-full flex-1 items-end">
                  <div
                    className="w-full cursor-default rounded-t-lg bg-blue-200 transition-colors hover:bg-blue-500"
                    style={{ height: `${Math.max((d.value / maxVal) * 100, d.value > 0 ? 4 : 0)}%` }}
                  />
                </div>
                <span className="shrink-0 text-[10px] font-medium text-slate-500">{d.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-bold text-slate-800">Service popularity</h3>
          {loading && !data ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-8 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          ) : (data?.servicePopularity.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No paid bookings in the selected range.</p>
          ) : (
            <div className="space-y-3">
              {data!.servicePopularity.map((s) => (
                <div key={s.name}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm text-slate-700">{s.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">{s.count} bookings</span>
                      <span className="text-xs font-bold text-slate-700">{s.pct}%</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-blue-500 transition-all" style={{ width: `${s.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-bold text-slate-800">Booking trends</h3>
          {loading && !data ? (
            <div className="space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : (
            <div className="space-y-2.5">
              {(data?.bookingTrends ?? []).map((t) => {
                const trend = formatTrend(t.trendPct);
                const invertTrendColor = t.label === "Cancellations" || t.label === "Refunds";
                const trendPositive =
                  trend.text === "—"
                    ? true
                    : invertTrendColor
                      ? trend.text.startsWith("-")
                      : trend.text.startsWith("+") || trend.text === "0%";
                return (
                  <div
                    key={t.label}
                    className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3"
                  >
                    <span className="text-sm text-slate-700">{t.label}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-slate-800">{t.value}</span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-semibold",
                          trendPositive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600",
                        )}
                      >
                        {trend.text}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
