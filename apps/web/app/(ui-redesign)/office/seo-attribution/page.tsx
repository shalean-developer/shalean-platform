"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Globe,
  TrendingUp,
  DollarSign,
  BookOpen,
  RefreshCw,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Search,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminData } from "@/hooks/useAdminData";
import { downloadCsv } from "@/lib/admin/csvExport";
import { DIRECT_BOOKING_FLOW_LANDING, landingDisplayName } from "@/lib/admin/landingPageAttribution";
import { SeoAttributionTrendChart } from "@/components/admin/seo-attribution/SeoAttributionTrendChart";
import {
  buildAttributionChannelBars,
  buildAttributionTrendSeries,
  buildSeoAttributionLandingCsv,
  findOrganicAttributionRow,
  formatAttributionSince,
  type SeoAttributionDayRow,
  type SeoAttributionLandingRow,
  type SeoAttributionServiceRow,
  type SeoAttributionSourceRow,
} from "@/lib/admin/officeSeoAttributionPresentation";

type SeoAttributionPayload = {
  since?: string;
  rowsLoaded?: number;
  summary: {
    distinctSessionsQuoted: number;
    distinctSessionsCompleted: number;
    overallConversionPct: number;
    sessionsTracked: number;
    sessionsWithUtm?: number;
    sessionsWithLandingCapture?: number;
  } | null;
  byLanding: SeoAttributionLandingRow[];
  bySource: SeoAttributionSourceRow[];
  byService?: SeoAttributionServiceRow[];
  byDay?: SeoAttributionDayRow[];
};

const DEFAULT_PAGE_SIZE = 15;
const PAGE_SIZE_OPTIONS = [10, 15, 25, 50] as const;

export default function SeoAttributionPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const { data, loading, error, refetch } = useAdminData<SeoAttributionPayload>("/api/admin/seo-attribution");

  const organicSource = useMemo(() => findOrganicAttributionRow(data?.bySource), [data]);
  const channelBars = useMemo(() => buildAttributionChannelBars(data?.bySource ?? []), [data]);
  const trendPoints = useMemo(() => buildAttributionTrendSeries(data?.byDay), [data]);
  const sinceLabel = formatAttributionSince(data?.since);

  const allPages = data?.byLanding ?? [];
  const filteredPages = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allPages;
    return allPages.filter(
      (p) =>
        p.landing.toLowerCase().includes(q) || landingDisplayName(p.landing).toLowerCase().includes(q),
    );
  }, [allPages, search]);

  const totalPages = Math.max(1, Math.ceil(filteredPages.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageFrom = filteredPages.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const pageTo = Math.min(safePage * pageSize, filteredPages.length);
  const pageRows = filteredPages.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const summary = data?.summary;
  const bySource = data?.bySource ?? [];
  const byService = data?.byService ?? [];

  function handleExportCsv() {
    if (filteredPages.length === 0) return;
    const csv = buildSeoAttributionLandingCsv(filteredPages);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`seo-attribution-landing-${stamp}.csv`, csv);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">SEO Attribution</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            First-touch landing and UTM attribution from analytics events
            {sinceLabel ? ` · since ${sinceLabel}` : " (last 30 days)"}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm hover:bg-slate-50"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Refresh
        </button>
      </div>

      {error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Sessions tracked", value: summary?.sessionsTracked ?? 0, icon: Globe, color: "bg-blue-50 text-blue-600" },
          { label: "Booking starts", value: summary?.distinctSessionsQuoted ?? 0, icon: BookOpen, color: "bg-violet-50 text-violet-600" },
          { label: "Completions", value: summary?.distinctSessionsCompleted ?? 0, icon: DollarSign, color: "bg-emerald-50 text-emerald-600" },
          {
            label: "Start → complete",
            value: summary ? `${summary.overallConversionPct}%` : "—",
            icon: TrendingUp,
            color: "bg-orange-50 text-orange-600",
          },
        ].map((k) => {
          const KIcon = k.icon;
          const [iconBg, iconColor] = k.color.split(" ");
          return (
            <div key={k.label} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
                  <p className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">{loading ? "—" : k.value}</p>
                  {k.label === "Completions" && organicSource ? (
                    <p className="mt-1 text-[11px] text-slate-400">Organic: {organicSource.completed} completions</p>
                  ) : null}
                  {k.label === "Sessions tracked" && summary ? (
                    <p className="mt-1 text-[11px] text-slate-400">
                      UTM captured: {summary.sessionsWithUtm ?? 0} · landing captured:{" "}
                      {summary.sessionsWithLandingCapture ?? 0}
                    </p>
                  ) : null}
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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Booking starts vs completions over time</h3>
            <p className="mt-0.5 text-xs text-slate-500">Daily analytics sessions that started and completed a booking</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-600" /> Starts
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-600" /> Completions
            </span>
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : trendPoints.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">No booking activity in this window yet.</p>
        ) : (
          <SeoAttributionTrendChart points={trendPoints} />
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="mb-1 text-sm font-bold text-slate-800">Completions by channel</h3>
          <p className="mb-4 text-xs text-slate-500">Grouped from UTM source / medium on first touch</p>
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : channelBars.length === 0 ? (
            <p className="text-sm text-slate-500">No attribution data yet.</p>
          ) : (
            <div className="space-y-3">
              {channelBars.map((s) => (
                <div key={s.label}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm text-slate-700">{s.label}</span>
                    <span className="text-xs font-bold text-slate-700">
                      {s.bookings} completions · {s.pct}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${s.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-3">
            <h3 className="text-sm font-bold text-slate-800">By source / medium</h3>
          </div>
          {loading ? (
            <p className="p-5 text-sm text-slate-500">Loading…</p>
          ) : bySource.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">No attributed booking starts yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    {["Source", "Medium", "Starts", "Completions", "CVR"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {bySource.map((r) => (
                    <tr key={r.key} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-slate-700">{r.source}</td>
                      <td className="px-4 py-3 text-slate-500">{r.medium}</td>
                      <td className="px-4 py-3 font-semibold text-slate-700">{r.quoted}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-600">{r.completed}</td>
                      <td className="px-4 py-3 text-xs font-bold text-blue-600">{r.conversionPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Landing page performance</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Marketing pages only — funnel steps like /details are grouped as Direct / booking flow
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search pages…"
                className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none ring-blue-500 focus:ring-2"
              />
            </div>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={loading || filteredPages.length === 0}
              title="Export the landing page table to CSV"
              className="flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-40"
            >
              <Download className="h-4 w-4" /> Export
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : filteredPages.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">
            {search.trim() ? "No pages match your search." : "No landing page data yet."}
          </p>
        ) : (
          <div className="overflow-x-auto px-5 pb-2 pt-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {["Page", "Sessions", "Starts", "Completions", "CVR"].map((h) => (
                    <th key={h} className="pb-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pageRows.map((p) => (
                  <tr key={p.landing} className="hover:bg-slate-50/50">
                    <td className="py-3 pr-4">
                      <p className="text-sm font-semibold text-slate-800">{landingDisplayName(p.landing)}</p>
                      <p
                        className={cn(
                          "text-xs",
                          p.landing === DIRECT_BOOKING_FLOW_LANDING ? "text-slate-500 italic" : "font-mono text-slate-400",
                        )}
                      >
                        {p.landing === DIRECT_BOOKING_FLOW_LANDING
                          ? "Sessions that started in checkout without a marketing landing"
                          : p.landing}
                      </p>
                    </td>
                    <td className="py-3 pr-4 text-slate-700">{p.sessions}</td>
                    <td className="py-3 pr-4 font-semibold text-slate-700">{p.quoted}</td>
                    <td className="py-3 pr-4 font-semibold text-emerald-600">{p.completed}</td>
                    <td className="py-3">
                      <span className={cn("text-xs font-bold", p.conversionPct >= 4 ? "text-emerald-600" : "text-blue-600")}>
                        {p.conversionPct}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filteredPages.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
            <p className="text-xs text-slate-400">
              Showing {pageFrom}–{pageTo} of {filteredPages.length} page{filteredPages.length === 1 ? "" : "s"}
              {search.trim() ? ` matching “${search.trim()}”` : ""}
              {data?.rowsLoaded != null ? ` · ${data.rowsLoaded.toLocaleString()} events` : ""}
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

      {!loading && byService.length > 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-3">
            <h3 className="text-sm font-bold text-slate-800">By service type</h3>
            <p className="mt-0.5 text-xs text-slate-500">From service_type on booking start / completion events</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  {["Service", "Starts", "Completions", "CVR"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {byService.map((r) => (
                  <tr key={r.service} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium text-slate-800">{r.service}</td>
                    <td className="px-4 py-3 text-slate-700">{r.quoted}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-600">{r.completed}</td>
                    <td className="px-4 py-3 text-xs font-bold text-blue-600">{r.conversionPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
