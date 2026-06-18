"use client";

import { useState } from "react";
import { BarChart3, TrendingUp, DollarSign, Users, Star, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Period = "7d" | "30d" | "90d";

const REVENUE_DATA: Record<Period, { label: string; value: number }[]> = {
  "7d": [
    { label: "Mon", value: 780 },
    { label: "Tue", value: 1250 },
    { label: "Wed", value: 2100 },
    { label: "Thu", value: 780 },
    { label: "Fri", value: 1560 },
    { label: "Sat", value: 3400 },
    { label: "Sun", value: 780 },
  ],
  "30d": [
    { label: "W1", value: 5200 }, { label: "W2", value: 7800 },
    { label: "W3", value: 6100 }, { label: "W4", value: 9400 },
  ],
  "90d": [
    { label: "Apr", value: 18200 }, { label: "May", value: 24600 }, { label: "Jun", value: 31000 },
  ],
};

const SERVICE_POPULARITY = [
  { name: "Standard Clean", pct: 62, count: 96 },
  { name: "Deep Clean", pct: 21, count: 33 },
  { name: "Move Out Clean", pct: 9, count: 14 },
  { name: "End of Tenancy", pct: 5, count: 8 },
  { name: "Office Clean", pct: 3, count: 5 },
];

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const data = REVENUE_DATA[period];
  const maxVal = Math.max(...data.map(d => d.value));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
          <p className="mt-0.5 text-sm text-slate-500">Business performance insights, revenue trends and customer metrics.</p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {(["7d", "30d", "90d"] as Period[]).map((p) => (
            <button key={p} type="button" onClick={() => setPeriod(p)}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                period === p ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-700")}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total revenue", value: "R 24 600", trend: "+18%", dir: "up" as const, icon: DollarSign, color: "bg-emerald-50 text-emerald-600" },
          { label: "Total bookings", value: "38", trend: "+9%", dir: "up" as const, icon: BarChart3, color: "bg-blue-50 text-blue-600" },
          { label: "Avg booking value", value: "R 1 433", trend: "+7%", dir: "up" as const, icon: TrendingUp, color: "bg-violet-50 text-violet-600" },
          { label: "Customer retention", value: "64%", trend: "-2%", dir: "down" as const, icon: Users, color: "bg-orange-50 text-orange-600" },
        ].map((k) => {
          const KIcon = k.icon;
          const [iconBg, iconColor] = k.color.split(" ");
          return (
            <div key={k.label} className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
                  <p className="mt-1.5 text-2xl font-bold text-slate-900">{k.value}</p>
                  <div className={cn("mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    k.dir === "up" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600")}>
                    {k.dir === "up" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {k.trend}
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

      {/* Revenue chart */}
      <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">Revenue — {period}</h3>
          <span className="text-xs text-slate-400">R {data.reduce((a, d) => a + d.value, 0).toLocaleString("en-ZA")} total</span>
        </div>
        <div className="flex items-end gap-3 h-40">
          {data.map((d) => (
            <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] text-slate-500">R{(d.value / 1000).toFixed(1)}k</span>
              <div className="w-full rounded-t-lg bg-blue-200 hover:bg-blue-500 transition-colors cursor-default"
                style={{ height: `${(d.value / maxVal) * 100}%` }} />
              <span className="text-[10px] font-medium text-slate-500">{d.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Service popularity + booking trends side by side */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-bold text-slate-800">Service popularity</h3>
          <div className="space-y-3">
            {SERVICE_POPULARITY.map((s) => (
              <div key={s.name}>
                <div className="flex items-center justify-between mb-1">
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
        </div>

        <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-bold text-slate-800">Booking trends (30d)</h3>
          <div className="space-y-2.5">
            {[
              { label: "New bookings", value: 38, prev: 35, trend: "+8.6%" },
              { label: "Recurring visits", value: 24, prev: 20, trend: "+20%" },
              { label: "Cancellations", value: 3, prev: 5, trend: "-40%" },
              { label: "Refunds", value: 1, prev: 2, trend: "-50%" },
            ].map((t) => (
              <div key={t.label} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
                <span className="text-sm text-slate-700">{t.label}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-slate-800">{t.value}</span>
                  <span className={cn("text-xs font-semibold rounded-full px-2 py-0.5",
                    t.trend.startsWith("+") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600")}>
                    {t.trend}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
