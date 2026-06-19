"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Activity,
  Target,
  CloudDownload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminData, adminFetch } from "@/hooks/useAdminData";
import { emitAdminToast } from "@/lib/admin/toastBus";
import {
  buildOfficeSeoKpis,
  buildOfficeSeoPageRows,
  formatRecommendationDetail,
  seoHealthBandClass,
  type SeoInsightsPayload,
} from "@/lib/admin/officeSeoInsightsPresentation";

const DEFAULT_PAGE_SIZE = 15;
const PAGE_SIZE_OPTIONS = [10, 15, 25, 50] as const;

function formatSince(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString("en-ZA", { month: "short", day: "numeric", year: "numeric" });
}

export default function SeoInsightsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [syncingGsc, setSyncingGsc] = useState(false);

  const { data, loading, error, refetch } = useAdminData<SeoInsightsPayload>("/api/admin/seo-insights");

  const pageRows = useMemo(() => buildOfficeSeoPageRows(data), [data]);
  const kpis = useMemo(() => buildOfficeSeoKpis(data), [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pageRows;
    return pageRows.filter((r) => r.slug.toLowerCase().includes(q) || r.label.toLowerCase().includes(q));
  }, [pageRows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageFrom = filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const pageTo = Math.min(safePage * pageSize, filtered.length);
  const tableRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const issues = data?.optimization.recommendations ?? [];
  const sinceLabel = formatSince(data?.since);
  const hasGsc = kpis.gscPages > 0;
  const gscSource = data?.gsc_config_source ?? "none";

  async function handleGscSync() {
    setSyncingGsc(true);
    try {
      const res = await adminFetch<{
        ok?: boolean;
        rowsSaved?: number;
        locationRowsMatched?: number;
        error?: string;
      }>("/api/admin/seo/gsc-sync", { method: "POST" });
      if (!res.ok || !res.data?.ok) {
        emitAdminToast(res.data?.error ?? res.error ?? "GSC sync failed.", "error");
        return;
      }
      emitAdminToast(
        `GSC synced — ${res.data.rowsSaved ?? 0} location row${res.data.rowsSaved === 1 ? "" : "s"} saved.`,
        "success",
      );
      await refetch();
    } finally {
      setSyncingGsc(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">SEO Insights</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            On-site SEO health from hub events{sinceLabel ? ` · since ${sinceLabel}` : ""}.
            {hasGsc
              ? ` GSC: ${kpis.gscPages} pages (${gscSource === "database" ? "synced" : gscSource}).`
              : " Sync GSC or add LOCATION_SEO_FEEDBACK_JSON for search positions."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleGscSync()}
            disabled={syncingGsc || loading}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
          >
            <CloudDownload className={cn("h-4 w-4", syncingGsc && "animate-pulse")} />
            {syncingGsc ? "Syncing GSC…" : "Sync GSC"}
          </button>
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

      {!loading && !error && kpis.gscPages === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">GSC metrics not loaded</p>
          <p className="mt-1 text-amber-900/90">
            Click <strong>Sync GSC</strong> after setting{" "}
            <code className="rounded bg-amber-100 px-1 text-xs">GSC_CLIENT_EMAIL</code>,{" "}
            <code className="rounded bg-amber-100 px-1 text-xs">GSC_PRIVATE_KEY</code>, and{" "}
            <code className="rounded bg-amber-100 px-1 text-xs">GSC_SITE_URL</code> in{" "}
            <code className="rounded bg-amber-100 px-1 text-xs">.env.local</code>. Manual fallback:{" "}
            <code className="rounded bg-amber-100 px-1 text-xs">LOCATION_SEO_FEEDBACK_JSON_FILE</code>.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Pages tracked", value: kpis.pagesTracked, icon: Activity, color: "bg-blue-50 text-blue-600" },
          { label: "Avg health score", value: kpis.avgHealth ?? "—", icon: Target, color: "bg-violet-50 text-violet-600" },
          { label: "Critical pages", value: kpis.criticalPages, icon: AlertTriangle, color: "bg-red-50 text-red-600" },
          {
            label: hasGsc ? "Avg GSC position" : "Booking starts",
            value: hasGsc ? (kpis.avgPosition ?? "—") : kpis.totalBookingStarts,
            icon: TrendingUp,
            color: "bg-emerald-50 text-emerald-600",
          },
        ].map((k) => {
          const KIcon = k.icon;
          const [iconBg, iconColor] = k.color.split(" ");
          return (
            <div key={k.label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{loading ? "—" : k.value}</p>
                </div>
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", iconBg)}>
                  <KIcon className={cn("h-5 w-5", iconColor)} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              type="search"
              placeholder="Search location pages…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
            />
          </div>

          {loading ? (
            <div className="flex items-center gap-2 px-4 py-12 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-12 text-sm text-slate-500">
              {search.trim()
                ? "No pages match your search."
                : "No hub pages scored yet — SEO events (scroll, CTA clicks) need to accumulate on location pages."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    {["Page", "Health", "Change", "Band", "Impressions", "CTR", "Position", "Starts"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {tableRows.map((row) => (
                    <tr key={row.slug} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">
                          {row.label}
                          {row.impressions != null || row.avgPosition != null ? (
                            <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-sky-700">
                              GSC
                            </span>
                          ) : null}
                        </p>
                        <p className="font-mono text-xs text-slate-400">{row.slug}</p>
                      </td>
                      <td className="px-4 py-3 font-bold tabular-nums text-slate-800">{row.healthScore}</td>
                      <td className="px-4 py-3">
                        {row.healthDelta == null ? (
                          <span className="flex items-center gap-1 text-xs text-slate-400">
                            <Minus className="h-3.5 w-3.5" /> —
                          </span>
                        ) : row.healthDelta > 0 ? (
                          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                            <TrendingUp className="h-3.5 w-3.5" />+{row.healthDelta}
                          </span>
                        ) : row.healthDelta < 0 ? (
                          <span className="flex items-center gap-1 text-xs font-semibold text-red-600">
                            <TrendingDown className="h-3.5 w-3.5" />{row.healthDelta}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", seoHealthBandClass(row.healthBand))}>
                          {row.healthBand.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.impressions?.toLocaleString() ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.ctrPct != null ? `${row.ctrPct}%` : "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.avgPosition != null ? `#${row.avgPosition}` : "—"}</td>
                      <td className="px-4 py-3 font-semibold text-slate-700">{row.bookingStarts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && filtered.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
              <p className="text-xs text-slate-400">
                Showing {pageFrom}–{pageTo} of {filtered.length} page{filtered.length === 1 ? "" : "s"}
                {data?.rows_loaded != null ? ` · ${data.rows_loaded.toLocaleString()} events` : ""}
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

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="mb-1 text-sm font-bold text-slate-800">Recommendations</h3>
          <p className="mb-4 text-xs text-slate-500">Live engine output plus saved cron recommendations</p>
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : issues.length === 0 ? (
            <p className="text-sm text-emerald-600">No open SEO recommendations — pages look healthy.</p>
          ) : (
            <div className="max-h-[520px] space-y-3 overflow-y-auto">
              {issues.slice(0, 12).map((issue) => {
                const sev = String(issue.severity ?? "").toLowerCase();
                const type = sev === "critical" || sev === "error" ? "error" : sev === "warning" || sev === "warn" ? "warning" : "info";
                const detail = formatRecommendationDetail(issue.detail);
                return (
                  <div
                    key={issue.id}
                    className={cn(
                      "rounded-xl border p-3",
                      type === "error"
                        ? "border-red-200 bg-red-50"
                        : type === "warning"
                          ? "border-orange-200 bg-orange-50"
                          : "border-blue-200 bg-blue-50",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {type === "info" ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                      ) : (
                        <AlertTriangle
                          className={cn("mt-0.5 h-4 w-4 shrink-0", type === "error" ? "text-red-600" : "text-orange-600")}
                        />
                      )}
                      <div>
                        <p className="text-xs font-bold text-slate-800">{issue.title}</p>
                        {detail ? <p className="mt-0.5 text-xs text-slate-500">{detail}</p> : null}
                        {issue.slug ? <p className="mt-0.5 font-mono text-[10px] text-slate-400">{issue.slug}</p> : null}
                      </div>
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
