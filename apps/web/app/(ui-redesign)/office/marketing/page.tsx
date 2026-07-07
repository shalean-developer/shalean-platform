"use client";

import { useMemo, useState } from "react";
import {
  Megaphone,
  TrendingUp,
  MousePointer,
  DollarSign,
  BarChart3,
  RefreshCw,
  AlertCircle,
  Loader2,
  Lightbulb,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { showToast } from "@/components/ui/notifications";
import { adminFetch, useAdminData } from "@/hooks/useAdminData";
import {
  MARKETING_CHANNEL_LABELS,
  type MarketingChannel,
} from "@/lib/admin/marketingAttribution";
import type { MarketingSummary } from "@/lib/admin/marketingAggregation";

type Range = "today" | "7d" | "30d";

const RANGE_LABEL: Record<Range, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

function money(v: number): string {
  return `R ${Math.round(v).toLocaleString("en-ZA")}`;
}

export default function MarketingPage() {
  const [range, setRange] = useState<Range>("30d");
  const [spendForm, setSpendForm] = useState({
    channel: "google_ads" as MarketingChannel,
    amount: "",
    date: new Date().toISOString().slice(0, 10),
  });

  const { data, loading, error, refetch } = useAdminData<MarketingSummary>("/api/admin/marketing", {
    params: { range },
  });

  const leadSources = useMemo(() => {
    const channels = data?.channels ?? [];
    const totalBookings = channels.reduce((s, c) => s + c.bookings, 0) || 1;
    return [...channels]
      .filter((c) => c.bookings > 0)
      .sort((a, b) => b.bookings - a.bookings)
      .map((c) => ({
        source: MARKETING_CHANNEL_LABELS[c.channel] ?? c.channel,
        bookings: c.bookings,
        pct: Math.round((c.bookings / totalBookings) * 100),
      }));
  }, [data]);

  const maxTrendValue = useMemo(() => {
    const vals = data?.charts.revenueVsSpend.flatMap((d) => [d.revenue, d.spend]) ?? [];
    return vals.length ? Math.max(...vals, 1) : 1;
  }, [data?.charts.revenueVsSpend]);

  const maxBar = useMemo(() => {
    const vals = data?.charts.bookingsPerChannel.map((c) => c.bookings) ?? [];
    return vals.length ? Math.max(...vals, 1) : 1;
  }, [data?.charts.bookingsPerChannel]);

  async function addSpend(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(spendForm.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      showToast("Enter a valid spend amount.", "error");
      return;
    }

    const result = await adminFetch("/api/admin/marketing", {
      method: "POST",
      body: JSON.stringify({ ...spendForm, amount }),
    });
    if (!result.ok) {
      showToast(result.error ?? "Could not save spend.", "error");
      return;
    }
    showToast("Spend saved.", "success");
    setSpendForm((p) => ({ ...p, amount: "" }));
    await refetch();
  }

  const funnel = data?.funnel;
  const kpis = data?.kpis;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Marketing</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Channel spend, funnel and conversion from analytics events ({RANGE_LABEL[range].toLowerCase()}).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {(["today", "7d", "30d"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                  range === r ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50",
                )}
              >
                {RANGE_LABEL[r]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800">Manual ad spend</h3>
        <p className="mt-0.5 text-xs text-slate-500">Record Google or Facebook spend to calculate ROAS and CPA.</p>
        <form onSubmit={(e) => void addSpend(e)} className="mt-3 grid gap-2 sm:grid-cols-4">
          <select
            value={spendForm.channel}
            onChange={(e) => setSpendForm((p) => ({ ...p, channel: e.target.value as MarketingChannel }))}
            className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 focus:border-blue-300 focus:outline-none"
          >
            <option value="google_ads">Google Ads</option>
            <option value="facebook_ads">Facebook Ads</option>
            <option value="organic_seo">Organic SEO</option>
            <option value="direct">Direct</option>
          </select>
          <input
            value={spendForm.amount}
            onChange={(e) => setSpendForm((p) => ({ ...p, amount: e.target.value }))}
            placeholder="Amount (ZAR)"
            className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 focus:border-blue-300 focus:outline-none"
          />
          <input
            type="date"
            value={spendForm.date}
            onChange={(e) => setSpendForm((p) => ({ ...p, date: e.target.value }))}
            className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 focus:border-blue-300 focus:outline-none"
          />
          <button
            type="submit"
            className="h-10 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            Add spend
          </button>
        </form>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Total ad spend", value: kpis ? money(kpis.totalAdSpend) : "—", icon: DollarSign, color: "bg-red-50 text-red-600" },
          { label: "Bookings from ads", value: kpis?.totalBookingsFromAds ?? "—", icon: Target, color: "bg-orange-50 text-orange-600" },
          { label: "Page views", value: funnel?.visitors ?? "—", icon: MousePointer, color: "bg-blue-50 text-blue-600" },
          { label: "Completions", value: funnel?.completed ?? "—", icon: TrendingUp, color: "bg-emerald-50 text-emerald-600" },
          { label: "Ad revenue", value: kpis ? money(kpis.revenueFromAds) : "—", icon: BarChart3, color: "bg-violet-50 text-violet-600" },
        ].map((k) => {
          const KIcon = k.icon;
          const [iconBg, iconColor] = k.color.split(" ");
          return (
            <div key={k.label} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-800 tabular-nums">{loading ? "—" : k.value}</p>
                </div>
                <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", iconBg)}>
                  <KIcon className={cn("h-4 w-4", iconColor)} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {kpis && !loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cost per booking (CPA)</p>
            <p className="mt-1 text-xl font-bold text-slate-800">{money(kpis.cpa)}</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Return on ad spend (ROAS)</p>
            <p className="mt-1 text-xl font-bold text-slate-800">{kpis.roas > 0 ? `${kpis.roas.toFixed(2)}x` : "—"}</p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm lg:col-span-2">
          <h3 className="mb-4 text-sm font-bold text-slate-800">Channels</h3>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {["Channel", "Spend", "Bookings", "Revenue", "CPA", "ROAS"].map((h) => (
                      <th key={h} className="pb-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {(data?.channels ?? []).map((c) => (
                    <tr key={c.channel}>
                      <td className="py-2.5 font-semibold text-slate-800">
                        {MARKETING_CHANNEL_LABELS[c.channel] ?? c.channel}
                      </td>
                      <td className="py-2.5 text-slate-600">{money(c.spend)}</td>
                      <td className="py-2.5 text-slate-700">{c.bookings}</td>
                      <td className="py-2.5 font-bold text-slate-800">{money(c.revenue)}</td>
                      <td className="py-2.5 text-slate-600">{c.bookings > 0 ? money(c.cpa) : "—"}</td>
                      <td className="py-2.5 text-emerald-600">{c.roas > 0 ? c.roas.toFixed(2) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-bold text-slate-800">Lead sources</h3>
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : leadSources.length === 0 ? (
            <p className="text-sm text-slate-500">No booking attribution yet.</p>
          ) : (
            <div className="space-y-3">
              {leadSources.map((s) => (
                <div key={s.source}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm text-slate-700">{s.source}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">{s.bookings} bookings</span>
                      <span className="text-xs font-bold text-slate-700">{s.pct}%</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-blue-500" style={{ width: `${s.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {funnel && data && !loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
              <Megaphone className="h-4 w-4" /> Booking funnel
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <FunnelStat label="Views" value={funnel.visitors} pct={100} />
              <FunnelStat label="Started" value={funnel.started} pct={data.funnelConversion.visitToStartPct} />
              <FunnelStat label="Priced" value={funnel.viewedPrice} pct={data.funnelConversion.startToPricePct} />
              <FunnelStat label="Timed" value={funnel.selectedTime} pct={data.funnelConversion.priceToTimePct} />
              <FunnelStat label="Completed" value={funnel.completed} pct={data.funnelConversion.timeToCompletePct} highlight />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-slate-800">ROI analysis</h3>
            <div className="space-y-2 text-sm text-slate-700">
              <p>
                Profit: <span className="font-bold text-slate-900">{money(data.roi.profit)}</span>
              </p>
              <p>
                Best channel:{" "}
                <span className="font-bold text-slate-900">
                  {data.roi.bestChannel ? MARKETING_CHANNEL_LABELS[data.roi.bestChannel] : "—"}
                </span>
              </p>
              <p>
                Weakest channel:{" "}
                <span className="font-bold text-slate-900">
                  {data.roi.worstChannel ? MARKETING_CHANNEL_LABELS[data.roi.worstChannel] : "—"}
                </span>
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {data && !loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-slate-800">Revenue vs spend</h3>
            <svg viewBox="0 0 560 220" className="h-52 w-full">
              <polyline
                fill="none"
                stroke="#10b981"
                strokeWidth="3"
                points={data.charts.revenueVsSpend
                  .map(
                    (d, i) =>
                      `${(i / Math.max(1, data.charts.revenueVsSpend.length - 1)) * 540 + 10},${200 - (d.revenue / maxTrendValue) * 170}`,
                  )
                  .join(" ")}
              />
              <polyline
                fill="none"
                stroke="#2563eb"
                strokeWidth="3"
                points={data.charts.revenueVsSpend
                  .map(
                    (d, i) =>
                      `${(i / Math.max(1, data.charts.revenueVsSpend.length - 1)) * 540 + 10},${200 - (d.spend / maxTrendValue) * 170}`,
                  )
                  .join(" ")}
              />
            </svg>
            <div className="mt-2 flex gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-4 rounded bg-emerald-500" /> Revenue
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-4 rounded bg-blue-600" /> Spend
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-slate-800">Bookings per channel</h3>
            <div className="space-y-3">
              {data.charts.bookingsPerChannel.map((row) => (
                <div key={row.channel}>
                  <div className="mb-1 flex justify-between text-xs text-slate-600">
                    <span>{MARKETING_CHANNEL_LABELS[row.channel]}</span>
                    <span>{row.bookings}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-emerald-500"
                      style={{ width: `${Math.max(row.bookings > 0 ? 6 : 0, (row.bookings / maxBar) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {data && !loading ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
            <Lightbulb className="h-4 w-4 text-amber-500" /> Campaign insights
          </h3>
          {data.insights.length === 0 ? (
            <p className="text-sm text-slate-500">No insights yet — add spend and wait for more booking volume.</p>
          ) : (
            <ul className="space-y-2">
              {data.insights.map((insight) => (
                <li key={insight} className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {insight}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

    </div>
  );
}

function FunnelStat({
  label,
  value,
  pct,
  highlight,
}: {
  label: string;
  value: number;
  pct: number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className={cn("text-lg font-bold tabular-nums", highlight ? "text-emerald-600" : "text-slate-800")}>{value}</p>
      <p className="text-xs font-medium text-slate-600">{label}</p>
      <p className="text-[11px] text-slate-400">{pct.toFixed(1)}% step conv.</p>
    </div>
  );
}
