"use client";

import { format } from "date-fns";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CloudDownload,
  Download,
  Loader2,
  Minus,
  RefreshCw,
  Search,
  Settings2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { SeoMomentumMatrix } from "@/components/admin/seo-insights/SeoMomentumMatrix";
import { SeoMomentumRisersFallers } from "@/components/admin/seo-insights/SeoMomentumRisersFallers";
import { SeoOpportunityMap } from "@/components/admin/seo-insights/SeoOpportunityMap";
import { SeoInsightsTopOpportunities } from "@/components/admin/seo-insights/SeoInsightsTopOpportunities";
import { SeoIssuesPanel } from "@/components/admin/seo-insights/SeoIssuesPanel";
import {
  AnalyticsDateRangePicker,
  type AnalyticsRange,
} from "@/components/admin/office/AnalyticsDateRangePicker";
import { downloadCsv } from "@/lib/admin/csvExport";
import type { OfficeAnalyticsSummary } from "@/lib/admin/officeAnalytics";
import {
  buildOfficeSeoActivityFeed,
  buildOfficeSeoClicksChart,
  buildOfficeSeoDashboardSummary,
  buildOfficeSeoHighlights,
  buildOfficeSeoIssueBreakdown,
  buildOfficeSeoMomentumMatrixPoints,
  buildOfficeSeoMomentumMoverRows,
  buildOfficeSeoPageRows,
  buildOfficeSeoPagesCsv,
  buildOfficeSeoSearchQueriesCsv,
  buildOfficeSeoSearchQueryRows,
  formatRecommendationDetail,
  seoHealthBarColor,
  type SeoInsightsPayload,
} from "@/lib/admin/officeSeoInsightsPresentation";
import { adminFetch, useAdminData } from "@/hooks/useAdminData";
import { emitAdminToast } from "@/lib/admin/toastBus";
import { cn } from "@/lib/utils";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

const DEFAULT_PAGE_SIZE = 15;
const PAGE_SIZE_OPTIONS = [10, 15, 25, 50] as const;

function defaultRange(): AnalyticsRange {
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from, to };
}

function formatSince(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString("en-ZA", { month: "short", day: "numeric", year: "numeric" });
}

function formatTrend(pct: number | null): { text: string; positive: boolean } {
  if (pct == null) return { text: "—", positive: true };
  const sign = pct > 0 ? "+" : "";
  return { text: `${sign}${pct}%`, positive: pct >= 0 };
}

function zar(value: number): string {
  return `R ${Math.round(value).toLocaleString("en-ZA")}`;
}

function MiniSparkline({ points, color }: { points: { value: number }[]; color: string }) {
  if (points.length === 0) {
    return <div className="h-16 rounded-lg bg-slate-50" />;
  }
  return (
    <div className="h-16 w-full [&_.recharts-tooltip-wrapper]:outline-none">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${color}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#spark-${color})`} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function HealthGauge({ score }: { score: number | null }) {
  const pct = score ?? 0;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  const tone =
    pct >= 80 ? "text-emerald-600" : pct >= 60 ? "text-amber-600" : pct >= 40 ? "text-orange-600" : "text-red-600";
  const stroke =
    pct >= 80 ? "#059669" : pct >= 60 ? "#d97706" : pct >= 40 ? "#ea580c" : "#dc2626";

  return (
    <div className="flex flex-col items-center justify-center py-2">
      <div className="relative h-36 w-36">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 128 128">
          <circle cx="64" cy="64" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="10" />
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("text-3xl font-bold tabular-nums", tone)}>{score ?? "—"}</span>
          <span className="text-xs font-medium text-slate-500">Health score</span>
        </div>
      </div>
    </div>
  );
}

function HeroKpiCard({
  label,
  value,
  trend,
  points,
  color,
}: {
  label: string;
  value: string;
  trend: { text: string; positive: boolean };
  points: { value: number }[];
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{value}</p>
          <span
            className={cn(
              "mt-1 inline-flex items-center gap-1 text-xs font-semibold",
              trend.positive ? "text-emerald-600" : "text-red-600",
            )}
          >
            {trend.positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {trend.text}
          </span>
        </div>
      </div>
      <div className="mt-4">
        <MiniSparkline points={points} color={color} />
      </div>
    </div>
  );
}

function QuerySparkBar({ value, max }: { value: number; max: number }) {
  const pct = Math.max(4, Math.round((value / max) * 100));
  return (
    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function SeoDashboardOverview() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [syncingGsc, setSyncingGsc] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showAllQueries, setShowAllQueries] = useState(false);
  const [showIssuesPanel, setShowIssuesPanel] = useState(false);
  const [range, setRange] = useState<AnalyticsRange>(defaultRange);

  const analyticsParams = useMemo(
    () => ({ from: format(range.from, "yyyy-MM-dd"), to: format(range.to, "yyyy-MM-dd") }),
    [range],
  );

  const { data, loading, error, refetch } = useAdminData<SeoInsightsPayload>("/api/admin/seo-insights");
  const { data: analytics, loading: analyticsLoading } = useAdminData<OfficeAnalyticsSummary>(
    "/api/admin/office-analytics",
    { params: analyticsParams },
  );

  const pageRows = useMemo(() => buildOfficeSeoPageRows(data), [data]);
  const summary = useMemo(() => buildOfficeSeoDashboardSummary(data), [data]);
  const highlights = useMemo(() => buildOfficeSeoHighlights(data), [data]);
  const searchQueries = useMemo(
    () => buildOfficeSeoSearchQueryRows(data, showAllQueries ? 50 : 8),
    [data, showAllQueries],
  );
  const maxQueryClicks = useMemo(
    () => Math.max(1, ...searchQueries.map((q) => q.clicks)),
    [searchQueries],
  );
  const hasRealQueries = (data?.gsc_query_count ?? 0) > 0;
  const issueBreakdown = useMemo(() => buildOfficeSeoIssueBreakdown(data), [data]);
  const activity = useMemo(() => buildOfficeSeoActivityFeed(data), [data]);
  const matrixPoints = useMemo(() => buildOfficeSeoMomentumMatrixPoints(data), [data]);
  const momentumRows = useMemo(() => buildOfficeSeoMomentumMoverRows(data), [data]);
  const issues = data?.optimization.recommendations ?? [];

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

  const sinceLabel = formatSince(data?.since);
  const hasGsc = (data?.gsc_import_snapshot?.length ?? 0) > 0;
  const gscSource = data?.gsc_config_source ?? "none";
  const gscSyncedAt = data?.gsc_synced_at ? formatSince(data.gsc_synced_at) : null;

  const revenueSparkline = useMemo(
    () => (analytics?.revenueChart ?? []).map((d) => ({ value: d.value })),
    [analytics],
  );
  const clicksSparkline = useMemo(
    () => buildOfficeSeoClicksChart(data).map((point) => ({ value: point.value })),
    [data],
  );

  const clicksTrend = formatTrend(summary.gscClicksTrendPct);
  const revenueTrend = formatTrend(analytics?.kpis.totalRevenueTrendPct ?? null);

  async function handleGscSync() {
    setSyncingGsc(true);
    try {
      const res = await adminFetch<{
        ok?: boolean;
        rowsSaved?: number;
        queryRowsSaved?: number;
        queryError?: string;
        error?: string;
      }>("/api/admin/seo/gsc-sync", { method: "POST" });
      if (!res.ok || !res.data?.ok) {
        emitAdminToast(res.data?.error ?? res.error ?? "GSC sync failed.", "error");
        return;
      }
      const pageCount = res.data.rowsSaved ?? 0;
      const queryCount = res.data.queryRowsSaved ?? 0;
      emitAdminToast(
        `GSC synced — ${pageCount} page${pageCount === 1 ? "" : "s"}, ${queryCount} quer${queryCount === 1 ? "y" : "ies"}.`,
        "success",
      );
      if (res.data.queryError) {
        emitAdminToast(`Query sync warning: ${res.data.queryError}`, "error");
      }
      await refetch();
    } finally {
      setSyncingGsc(false);
    }
  }

  function handleExport() {
    if (filtered.length === 0) return;
    const csv = buildOfficeSeoPagesCsv(filtered);
    downloadCsv(`seo-dashboard-pages-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  function handleExportQueries() {
    if (searchQueries.length === 0) return;
    const csv = buildOfficeSeoSearchQueriesCsv(searchQueries);
    downloadCsv(`seo-search-queries-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">SEO Dashboard Overview</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Manage all your SEO metrics{sinceLabel ? ` · since ${sinceLabel}` : ""}.
            {hasGsc
              ? ` GSC: ${data?.gsc_import_count ?? summary.pagesTracked} pages, ${data?.gsc_query_count ?? 0} queries (${gscSource === "database" ? "synced" : gscSource}).`
              : " Sync GSC for search performance data."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={loading || filtered.length === 0}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            Export data
          </button>
          <button
            type="button"
            onClick={() => setShowConfig((v) => !v)}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Settings2 className="h-4 w-4" />
            Configure
          </button>
          <button
            type="button"
            onClick={() => void handleGscSync()}
            disabled={syncingGsc || loading}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
          >
            <CloudDownload className={cn("h-4 w-4", syncingGsc && "animate-pulse")} />
            {syncingGsc ? "Syncing…" : "Sync GSC"}
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

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
        <AnalyticsDateRangePicker value={range} onChange={setRange} />
        <span className="text-xs text-slate-400">SEO health uses last 30 days of on-site events</span>
      </div>

      {showConfig ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">GSC configuration</p>
          <p className="mt-1 text-slate-600">
            Set <code className="rounded bg-white px-1 text-xs">GSC_CLIENT_EMAIL</code>,{" "}
            <code className="rounded bg-white px-1 text-xs">GSC_PRIVATE_KEY</code>, and{" "}
            <code className="rounded bg-white px-1 text-xs">GSC_SITE_URL</code> in{" "}
            <code className="rounded bg-white px-1 text-xs">.env.local</code>, then click Sync GSC. Manual fallback:{" "}
            <code className="rounded bg-white px-1 text-xs">LOCATION_SEO_FEEDBACK_JSON_FILE</code>.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Source: {gscSource} · {gscSyncedAt ? `Last synced ${gscSyncedAt}` : "Not synced yet"}
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      ) : null}

      {!loading && !error && !hasGsc ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">GSC metrics not loaded</p>
          <p className="mt-1 text-amber-900/90">
            Click <strong>Sync GSC</strong> to populate clicks, impressions, and search query data.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <HeroKpiCard
          label="Total clicks"
          value={loading ? "—" : summary.totalClicks.toLocaleString("en-ZA")}
          trend={clicksTrend}
          points={clicksSparkline}
          color="#059669"
        />
        <HeroKpiCard
          label="Revenue"
          value={analyticsLoading || !analytics ? "—" : zar(analytics.kpis.totalRevenueZar)}
          trend={revenueTrend}
          points={revenueSparkline}
          color="#2563eb"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <SeoOpportunityMap gscRows={data?.gsc_import_snapshot ?? []} />
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800">Highlights</h3>
          <p className="mb-4 text-xs text-slate-500">Key search metrics at a glance</p>
          <dl className="space-y-3">
            {highlights.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                <dt className="text-xs text-slate-500">{row.label}</dt>
                <dd className="text-right text-sm font-semibold tabular-nums text-slate-800">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Search queries</h3>
            <p className="text-xs text-slate-500">
              {hasRealQueries
                ? "Real GSC search terms driving traffic to location hubs"
                : "Top location pages by GSC clicks (sync queries for real keywords)"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">
              {searchQueries.length} of {data?.gsc_query_count ?? searchQueries.length}
            </span>
            {searchQueries.length > 0 ? (
              <button
                type="button"
                onClick={handleExportQueries}
                className="text-xs font-semibold text-blue-700 hover:underline"
              >
                Export queries
              </button>
            ) : null}
          </div>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 px-4 py-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : searchQueries.length === 0 ? (
          <p className="px-4 py-10 text-sm text-slate-500">No GSC query data yet — sync GSC to populate.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  {["Keyword", "Clicks", "Impressions", "CTR", "Position", "Trend"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {searchQueries.map((row) => (
                  <tr key={`${row.keyword}-${row.slug}`} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{row.keyword}</p>
                      <p className="text-[10px] text-slate-500">
                        {hasRealQueries ? `→ ${row.landingPage}` : row.slug}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums text-slate-700">{row.clicks.toLocaleString()}</span>
                        <QuerySparkBar value={row.clicks} max={maxQueryClicks} />
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{row.impressions.toLocaleString()}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{row.ctrPct != null ? `${row.ctrPct}%` : "—"}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{row.position != null ? `#${row.position}` : "—"}</td>
                    <td className="px-4 py-3">
                      {row.trend === "up" ? (
                        <TrendingUp className="h-4 w-4 text-emerald-600" />
                      ) : row.trend === "down" ? (
                        <TrendingDown className="h-4 w-4 text-red-600" />
                      ) : (
                        <Minus className="h-4 w-4 text-slate-400" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && (data?.gsc_query_count ?? 0) > 8 ? (
          <div className="border-t border-slate-100 px-4 py-3 text-right">
            <button
              type="button"
              onClick={() => setShowAllQueries((v) => !v)}
              className="text-xs font-semibold text-blue-700 hover:underline"
            >
              {showAllQueries ? "Show fewer queries" : "View all search queries"}
            </button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800">SEO health</h3>
          <p className="text-xs text-slate-500">
            Average on-site health across {summary.pagesTracked} tracked pages
            {gscSyncedAt ? ` · updated ${gscSyncedAt}` : ""}
          </p>
          <HealthGauge score={summary.avgHealth} />
          <div className="mt-2 grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-lg font-bold text-slate-900">{summary.criticalPages}</p>
              <p className="text-[11px] text-slate-500">Critical pages</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-lg font-bold text-slate-900">{summary.pagesTracked}</p>
              <p className="text-[11px] text-slate-500">Pages tracked</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">SEO issues</h3>
              <p className="text-xs text-slate-500">Open recommendations by severity</p>
            </div>
            <button
              type="button"
              onClick={() => setShowIssuesPanel(true)}
              disabled={issues.length === 0}
              className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              View all issues
            </button>
          </div>
          <div className="space-y-3">
            {[
              { label: "Critical issues", count: issueBreakdown.critical, tone: "border-red-200 bg-red-50 text-red-800" },
              { label: "Warnings", count: issueBreakdown.warnings, tone: "border-amber-200 bg-amber-50 text-amber-900" },
              {
                label: "Opportunities",
                count: issueBreakdown.opportunities,
                tone: "border-blue-200 bg-blue-50 text-blue-900",
              },
            ].map((item) => (
              <div key={item.label} className={cn("flex items-center justify-between rounded-xl border px-4 py-3", item.tone)}>
                <span className="text-sm font-medium">{item.label}</span>
                <span className="text-xl font-bold tabular-nums">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="mb-1 text-sm font-bold text-slate-800">Recent activity</h3>
          <p className="mb-4 text-xs text-slate-500">Momentum shifts and open recommendations</p>
          {activity.length === 0 ? (
            <p className="text-sm text-slate-500">No recent activity yet.</p>
          ) : (
            <ul className="space-y-4">
              {activity.map((item) => (
                <li key={item.id} className="relative border-l-2 border-slate-200 pl-4">
                  <span
                    className={cn(
                      "absolute -left-[5px] top-1.5 h-2 w-2 rounded-full",
                      item.tone === "positive" ? "bg-emerald-500" : item.tone === "negative" ? "bg-red-500" : "bg-slate-400",
                    )}
                  />
                  <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                  <p className="text-xs text-slate-500">{item.detail}</p>
                  <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">{item.when}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="mb-1 text-sm font-bold text-slate-800">Recommendations</h3>
          <p className="mb-4 text-xs text-slate-500">Actionable SEO improvements</p>
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : issues.length === 0 ? (
            <p className="text-sm text-emerald-600">No open SEO recommendations — pages look healthy.</p>
          ) : (
            <div className="max-h-[360px] space-y-3 overflow-y-auto">
              {issues.slice(0, 8).map((issue) => {
                const kind = String(issue.severity ?? "").toLowerCase();
                const type = kind === "critical" || kind === "error" ? "error" : kind === "warning" || kind === "warn" ? "warning" : "info";
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

      <div className="grid gap-4 xl:grid-cols-2">
        <SeoMomentumMatrix points={matrixPoints} />
        <SeoInsightsTopOpportunities rows={data?.gsc_import_snapshot ?? []} />
      </div>

      <SeoMomentumRisersFallers risers={momentumRows.risers} fallers={momentumRows.fallers} />

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-800">All pages</h3>
          <div className="ml-auto flex min-w-[200px] flex-1 items-center gap-2 sm:max-w-xs">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              type="search"
              placeholder="Search location pages…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 px-4 py-12 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-12 text-sm text-slate-500">
            {search.trim()
              ? "No pages match your search."
              : "No hub pages scored yet — SEO events need to accumulate on location pages."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  {["Page URL", "Status", "SEO health", "Clicks", "Impressions", "Position"].map((h) => (
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
                      <p className="font-medium text-slate-800">{row.label}</p>
                      <p className="font-mono text-xs text-slate-400">/{row.slug}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                          row.healthBand === "critical"
                            ? "bg-red-100 text-red-800"
                            : row.healthBand === "insufficient_data"
                              ? "bg-slate-100 text-slate-700"
                              : "bg-emerald-100 text-emerald-800",
                        )}
                      >
                        {row.healthBand === "critical" ? "Needs work" : row.healthBand === "insufficient_data" ? "Gathering" : "Published"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex min-w-[140px] items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={cn("h-full rounded-full transition-all", seoHealthBarColor(row.healthScore))}
                            style={{ width: `${Math.min(100, Math.max(0, row.healthScore))}%` }}
                          />
                        </div>
                        <span className="w-8 text-right text-xs font-bold tabular-nums text-slate-700">{row.healthScore}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{row.clicks?.toLocaleString() ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{row.impressions?.toLocaleString() ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{row.avgPosition != null ? `#${row.avgPosition}` : "—"}</td>
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
            </p>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-500">
                Rows
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
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
                onClick={() => setPage(Math.max(1, safePage - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <SeoIssuesPanel open={showIssuesPanel} onOpenChange={setShowIssuesPanel} data={data} />
    </div>
  );
}
