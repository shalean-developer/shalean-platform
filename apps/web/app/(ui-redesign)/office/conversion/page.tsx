"use client";

import { useEffect, useMemo, useState } from "react";
import {
  TrendingUp,
  ShoppingCart,
  CreditCard,
  Globe,
  RefreshCw,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminData } from "@/hooks/useAdminData";
import {
  funnelVisitorCount,
  paymentCompletedCount,
  type BookingFunnelApiPayload,
} from "@/lib/admin/officeFunnelPresentation";
import { DIRECT_BOOKING_FLOW_LANDING, landingDisplayName } from "@/lib/admin/landingPageAttribution";

type SeoLanding = {
  since?: string;
  rowsLoaded?: number;
  byLanding: Array<{
    landing: string;
    sessions: number;
    quoted: number;
    completed: number;
    conversionPct: number;
  }>;
};

const DEFAULT_PAGE_SIZE = 15;
const PAGE_SIZE_OPTIONS = [10, 15, 25, 50] as const;

function formatSince(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString("en-ZA", { month: "short", day: "numeric", year: "numeric" });
}

function pct(part: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((part / total) * 1000) / 10;
}

export default function ConversionPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const funnel = useAdminData<BookingFunnelApiPayload>("/api/admin/booking-funnel");
  const seo = useAdminData<SeoLanding>("/api/admin/seo-attribution");

  const loading = funnel.loading || seo.loading;
  const error = funnel.error ?? seo.error;
  const funnelData = funnel.data;
  const allPages = seo.data?.byLanding ?? [];

  const filteredPages = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allPages;
    return allPages.filter(
      (p) =>
        p.landing.toLowerCase().includes(q) ||
        landingDisplayName(p.landing).toLowerCase().includes(q),
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

  const visitors = funnelData ? funnelVisitorCount(funnelData) : null;
  const starts = funnelData?.funnelStartSessions ?? null;
  const completed = funnelData ? paymentCompletedCount(funnelData) : null;
  const startToPaidPct =
    starts != null && completed != null ? pct(completed, Math.max(starts, 1)) : null;

  const dailyTrends = funnelData?.intelligence?.dailyTrends ?? [];
  const dailyChart = dailyTrends.slice(-7);
  const sinceLabel = formatSince(funnelData?.since ?? seo.data?.since);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Conversion</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Session-based funnel from booking analytics{sinceLabel ? ` · since ${sinceLabel}` : ""}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void funnel.refetch();
            void seo.refetch();
          }}
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
          { label: "Funnel visitors", value: visitors ?? "—", icon: Globe, color: "bg-blue-50 text-blue-600" },
          { label: "Quote starts", value: starts ?? "—", icon: ShoppingCart, color: "bg-orange-50 text-orange-600" },
          { label: "Paid completions", value: completed ?? "—", icon: CreditCard, color: "bg-emerald-50 text-emerald-600" },
          {
            label: "Quote → paid",
            value: startToPaidPct != null ? `${startToPaidPct}%` : "—",
            icon: TrendingUp,
            color: "bg-violet-50 text-violet-600",
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
                </div>
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", iconBg)}>
                  <KIcon className={cn("h-5 w-5", iconColor)} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Landing page performance</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Marketing pages only — booking steps like /details and /booking/success are grouped separately
            </p>
          </div>
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
        </div>

        {loading ? (
          <div className="flex items-center gap-2 p-5 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : filteredPages.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">
            {search.trim() ? "No pages match your search." : "No landing page data yet."}
          </p>
        ) : (
          <div className="overflow-x-auto px-5 pb-2 pt-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {["Page", "Sessions", "Booking starts", "Completions", "CVR"].map((h) => (
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
                          p.landing === DIRECT_BOOKING_FLOW_LANDING ? "text-slate-500 italic" : "text-slate-400",
                        )}
                      >
                        {p.landing === DIRECT_BOOKING_FLOW_LANDING
                          ? "Sessions that started in checkout without a marketing landing"
                          : p.landing}
                      </p>
                    </td>
                    <td className="py-3 pr-4 text-slate-700">{p.sessions}</td>
                    <td className="py-3 pr-4 text-slate-700">{p.quoted}</td>
                    <td className="py-3 pr-4 font-semibold text-emerald-600">{p.completed}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 rounded-full bg-slate-100">
                          <div
                            className="h-2 rounded-full bg-blue-500"
                            style={{ width: `${Math.min(p.conversionPct * 4, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-blue-600">{p.conversionPct}%</span>
                      </div>
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
              {seo.data?.rowsLoaded != null ? ` · ${seo.data.rowsLoaded.toLocaleString()} events` : ""}
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

      {dailyChart.length > 0 && !loading ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="mb-1 text-sm font-bold text-slate-800">Daily funnel activity (last 7 days)</h3>
          <p className="mb-4 text-xs text-slate-500">Quote starts vs paid completions from booking funnel analytics</p>
          <div className="flex h-28 items-end gap-3">
            {dailyChart.map((d) => {
              const max = Math.max(...dailyChart.map((x) => Math.max(x.starts, x.completed)), 1);
              return (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] text-slate-500">{d.completed} paid</span>
                  <div className="flex h-20 w-full items-end justify-center gap-0.5">
                    <div
                      className="w-[42%] rounded-t bg-orange-200"
                      style={{ height: `${Math.max(8, (d.starts / max) * 100)}%` }}
                      title={`${d.starts} starts`}
                    />
                    <div
                      className="w-[42%] rounded-t bg-emerald-400"
                      style={{ height: `${Math.max(8, (d.completed / max) * 100)}%` }}
                      title={`${d.completed} completed`}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500">{d.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
