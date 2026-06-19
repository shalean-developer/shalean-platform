"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Star,
  TrendingUp,
  TrendingDown,
  Minus,
  Award,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminData } from "@/hooks/useAdminData";
import type { CleanerPerfRow, FleetDayTrend } from "@/lib/admin/cleanerPerformance";

const DEFAULT_PAGE_SIZE = 15;
const PAGE_SIZE_OPTIONS = [10, 15, 25, 50] as const;

type TrendDir = "up" | "down" | "stable";

function ScoreBadge({ score }: { score: number }) {
  const color =
    score > 80 ? "bg-emerald-100 text-emerald-700" :
    score >= 60 ? "bg-amber-100 text-amber-700" :
    "bg-red-100 text-red-700";
  return <span className={cn("rounded-full px-2.5 py-1 text-sm font-bold", color)}>{score}</span>;
}

function TrendIcon({ trend }: { trend: TrendDir }) {
  if (trend === "up") return <TrendingUp className="h-4 w-4 text-emerald-500" />;
  if (trend === "down") return <TrendingDown className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-slate-400" />;
}

function summarizeFleetTrend(trend: FleetDayTrend[]): { label: string; direction: TrendDir } {
  const active = trend.filter((d) => d.onTimePct != null);
  if (!active.length) return { label: "—", direction: "stable" };

  const avg = Math.round(active.reduce((s, d) => s + (d.onTimePct ?? 0), 0) / active.length);
  const mid = Math.floor(trend.length / 2);
  const mean = (days: FleetDayTrend[]) =>
    days.length ? days.reduce((s, d) => s + (d.onTimePct ?? 0), 0) / days.length : null;
  const earlyAvg = mean(trend.slice(0, mid).filter((d) => d.onTimePct != null));
  const lateAvg = mean(trend.slice(mid).filter((d) => d.onTimePct != null));

  let direction: TrendDir = "stable";
  if (earlyAvg != null && lateAvg != null) {
    if (lateAvg > earlyAvg + 3) direction = "up";
    else if (lateAvg < earlyAvg - 3) direction = "down";
  }

  return { label: `${avg}%`, direction };
}

export default function CleanerPerformancePage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const { data, loading, error, refetch } = useAdminData<{
    cleaners: CleanerPerfRow[];
    fleetTrend7d: FleetDayTrend[];
    meta: { days: number; fromYmd: string; bookingCount: number };
  }>("/api/admin/cleaner-performance", { params: { days: "120" } });

  const cleaners = data?.cleaners ?? [];
  const trend = data?.fleetTrend7d ?? [];
  const fleetSummary = useMemo(() => summarizeFleetTrend(trend), [trend]);
  const maxCompleted = useMemo(() => Math.max(1, ...trend.map((d) => d.completedJobs)), [trend]);

  const filtered = useMemo(
    () => cleaners.filter((c) => !search || c.cleanerName.toLowerCase().includes(search.toLowerCase())),
    [cleaners, search],
  );

  useEffect(() => {
    const timer = globalThis.setTimeout(() => setPage(1), 0);
    return () => globalThis.clearTimeout(timer);
  }, [search, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageFrom = filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const pageTo = Math.min(safePage * pageSize, filtered.length);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    if (page > totalPages) {
      const timer = globalThis.setTimeout(() => setPage(Math.max(1, totalPages)), 0);
      return () => globalThis.clearTimeout(timer);
    }
  }, [page, totalPages]);

  const avgScore = cleaners.length
    ? Math.round(cleaners.reduce((s, c) => s + c.reliabilityScore, 0) / cleaners.length)
    : 0;
  const topPerformer = cleaners.length
    ? cleaners.reduce((best, c) => (c.reliabilityScore > best.reliabilityScore ? c : best), cleaners[0])
    : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cleaner Performance</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Scores based on {data?.meta?.days ?? 120}-day window · {data?.meta?.bookingCount ?? 0} bookings analysed.
            On-time uses start time on the booking day vs scheduled slot (outliers excluded).
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Active cleaners", value: cleaners.length, icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-700" },
          { label: "Fleet avg score", value: loading ? "—" : avgScore, icon: Award, cls: "bg-blue-50 text-blue-700" },
          {
            label: "Top performer",
            value: loading ? "—" : (topPerformer?.cleanerName.split(" ")[0] ?? "—"),
            icon: Star,
            cls: "bg-amber-50 text-amber-700",
          },
        ].map(({ label, value, icon: Icon, cls }) => (
          <div key={label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className={cn("mb-2 flex h-9 w-9 items-center justify-center rounded-xl", cls)}>
              <Icon className="h-4 w-4" />
            </div>
            <p className="text-xl font-bold text-slate-900 tabular-nums">{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div className="flex items-center gap-2">
            <p className="text-xl font-bold text-slate-900 tabular-nums">
              {loading ? "—" : fleetSummary.label}
            </p>
            {!loading && fleetSummary.label !== "—" ? <TrendIcon trend={fleetSummary.direction} /> : null}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">Fleet on-time (7d)</p>
        </div>
      </div>

      {!loading && trend.length > 0 ? (
        <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Fleet trend (last 7 days)</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            On-time % among completed jobs with a known slot and start time. Bar height = completed volume.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3 md:gap-4">
            {trend.map((d) => (
              <div key={d.day} className="flex flex-col items-center gap-1">
                <div className="flex w-10 items-end justify-center rounded-md bg-slate-100" style={{ height: 88 }}>
                  <div
                    className="w-full rounded-md bg-emerald-500/90"
                    style={{ height: `${Math.max(6, (d.completedJobs / maxCompleted) * 88)}px` }}
                    title={`${d.completedJobs} completed`}
                  />
                </div>
                <p className="text-[10px] font-medium text-slate-500">{d.day.slice(5)}</p>
                <p className="text-xs font-bold tabular-nums text-slate-800">
                  {d.onTimePct != null ? `${d.onTimePct}%` : "—"}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

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
                  {["Cleaner", "Completed", "On-time %", "Avg lateness", "Completion %", "Reliability"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pageRows.map((c) => {
                  const onPct = c.punctualityJobs > 0 ? Math.round(c.onTimeRate * 1000) / 10 : null;
                  const compPct = c.completionDenominator > 0 ? Math.round(c.completionRate * 1000) / 10 : null;
                  return (
                    <tr key={c.cleanerId} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">{c.cleanerName}</div>
                        {c.lowSample ? (
                          <span className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                            Low sample
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-600">{c.jobsCompleted}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-600">
                        {onPct != null ? `${onPct}%` : "—"}
                        {c.punctualityJobs > 0 ? (
                          <span className="ml-1 text-[10px] text-slate-400">n={c.punctualityJobs}</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-600">
                        {c.punctualityJobs > 0 ? `${c.avgLateMinutes}m` : "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-600">
                        {compPct != null ? `${compPct}%` : "—"}
                      </td>
                      <td className="px-4 py-3"><ScoreBadge score={c.reliabilityScore} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtered.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-400">
              Showing {pageFrom}–{pageTo} of {filtered.length} cleaner{filtered.length === 1 ? "" : "s"}
              {search.trim() ? ` matching “${search.trim()}”` : ""}
            </p>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-500">
                Rows
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <span className="text-xs font-medium text-slate-500">
                Page {safePage} of {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
