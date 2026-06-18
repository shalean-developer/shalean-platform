"use client";

import { useState } from "react";
import { Search, Star, TrendingUp, TrendingDown, Minus, Award, Clock, CheckCircle2, RefreshCw, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminData } from "@/hooks/useAdminData";

type TrendDir = "up" | "down" | "stable";

type CleanerPerf = {
  cleanerId: string;
  name: string;
  completedJobs: number;
  lateArrivals: number;
  onTimeRate: number;
  avgRatingLast30d: number | null;
  reviewCount: number;
  performanceScore: number;
  trend7d: TrendDir;
};

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 95 ? "bg-emerald-100 text-emerald-700" :
    score >= 85 ? "bg-blue-100 text-blue-700" :
    score >= 75 ? "bg-orange-100 text-orange-700" :
    "bg-red-100 text-red-700";
  return <span className={cn("rounded-full px-2.5 py-1 text-sm font-bold", color)}>{score}</span>;
}

function TrendIcon({ trend }: { trend: TrendDir }) {
  if (trend === "up") return <TrendingUp className="h-4 w-4 text-emerald-500" />;
  if (trend === "down") return <TrendingDown className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-slate-400" />;
}

export default function CleanerPerformancePage() {
  const [search, setSearch] = useState("");

  const { data, loading, error, refetch } = useAdminData<{
    cleaners: CleanerPerf[];
    fleetTrend7d: TrendDir;
    meta: { days: number; bookingCount: number };
  }>("/api/admin/cleaner-performance");

  const cleaners = data?.cleaners ?? [];
  const filtered = cleaners.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()),
  );

  const avgScore = cleaners.length
    ? Math.round(cleaners.reduce((s, c) => s + c.performanceScore, 0) / cleaners.length)
    : 0;
  const topPerformer = cleaners.find((c) => c.performanceScore === Math.max(...cleaners.map(x => x.performanceScore)));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cleaner Performance</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Scores based on {data?.meta?.days ?? 120}-day window · {data?.meta?.bookingCount ?? 0} bookings analysed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 shadow-sm"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Active cleaners",     value: cleaners.length,                    icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-700" },
          { label: "Fleet avg score",     value: loading ? "—" : avgScore,            icon: Award,        cls: "bg-blue-50 text-blue-700" },
          { label: "Top performer",       value: loading ? "—" : (topPerformer?.name?.split(" ")[0] ?? "—"), icon: Star, cls: "bg-amber-50 text-amber-700" },
          { label: "Fleet trend (7d)",    value: loading ? "—" : (data?.fleetTrend7d ?? "—"), icon: TrendingUp, cls: "bg-violet-50 text-violet-700" },
        ].map(({ label, value, icon: Icon, cls }) => (
          <div key={label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className={cn("mb-2 flex h-9 w-9 items-center justify-center rounded-xl", cls)}>
              <Icon className="h-4 w-4" />
            </div>
            <p className="text-xl font-bold text-slate-900 tabular-nums">{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          placeholder="Search cleaners…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-20 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading performance data…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <Award className="mb-3 h-10 w-10 text-slate-200" />
            <p className="font-semibold text-slate-600">No results found</p>
            <p className="mt-1 text-sm text-slate-400">{search ? "Try a different search." : "No performance data available yet."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Cleaner", "Completed", "On-time rate", "Late arrivals", "Avg rating", "Score", "7d trend"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((c) => (
                  <tr key={c.cleanerId} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-800">{c.name}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{c.completedJobs}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{Math.round(c.onTimeRate * 100)}%</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{c.lateArrivals}</td>
                    <td className="px-4 py-3">
                      {c.avgRatingLast30d != null ? (
                        <div className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                          <span className="tabular-nums text-slate-700">{c.avgRatingLast30d.toFixed(1)}</span>
                          <span className="text-slate-400 text-xs">({c.reviewCount})</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3"><ScoreBadge score={c.performanceScore} /></td>
                    <td className="px-4 py-3"><TrendIcon trend={c.trend7d} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
