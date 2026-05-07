"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { SeoInsightsEmptyState } from "@/components/admin/seo-insights/SeoInsightsEmptyState";
import { SeoInsightsKpiCard, scoreToKpiStatus } from "@/components/admin/seo-insights/SeoInsightsKpiCard";
import { SeoMomentumMatrix, type SeoMomentumMatrixPoint } from "@/components/admin/seo-insights/SeoMomentumMatrix";
import { SeoMomentumRisersFallers } from "@/components/admin/seo-insights/SeoMomentumRisersFallers";
import { SeoOpportunityMap } from "@/components/admin/seo-insights/SeoOpportunityMap";
import { SeoInsightsTopOpportunities } from "@/components/admin/seo-insights/SeoInsightsTopOpportunities";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { humanizeLocationSlug } from "@/lib/seo/humanize-location-slug";
import { locationHubPathFromAreaInput, resolveCapeTownHubRowFromAreaInput } from "@/lib/seo/capeTownLocations";
import {
  affectedMetricBadgeClass,
  deriveSeoIssueSignals,
  normalizePageHealthBand,
  type SeoAffectedMetric,
} from "@/lib/seo/derive-seo-issue-signals";
import {
  computeSeoMomentumMovers,
  partitionSeoMomentumRisersFallers,
  type SeoMomentumMoverRow,
} from "@/lib/seo/compute-seo-momentum-movers";
import { cn } from "@/lib/utils";

type SeoInsightPeriodSlice = {
  since: string;
  until: string;
  rows_loaded: number;
  scroll_depth_by_slug: {
    slug: string;
    sessions_at_25: number;
    sessions_at_50: number;
    sessions_at_75: number;
    sessions_at_100: number;
    pct_read_to_100?: number;
    pct_to_50?: number;
    pct_to_75?: number;
    pct_to_100?: number;
  }[];
  booking_starts_by_slug: { slug: string; booking_starts: number }[];
  health_score_by_slug: { slug: string; health_score: number }[];
};

type Payload = {
  since?: string;
  until?: string;
  rows_loaded?: number;
  previous_period?: SeoInsightPeriodSlice | null;
  /** Additive window bundle — same data as top-level + `previous_period`, chart-friendly. */
  periods?: {
    current_30d: SeoInsightPeriodSlice;
    previous_30d: SeoInsightPeriodSlice | null;
  };
  booking_starts_by_slug?: { slug: string; booking_starts: number }[];
  top_suburbs_by_cta_clicks?: { suburb: string; seo_cta_clicks: number }[];
  top_cta_compound?: { key: string; count: number }[];
  cta_kind_booking_proxy?: {
    cta_kind: string;
    cta_location?: string;
    key?: string;
    distinct_sessions: number;
    sessions_with_booking_start: number;
    conversion_pct: number;
  }[];
  scroll_depth_by_slug?: {
    slug: string;
    sessions_at_25: number;
    sessions_at_50: number;
    sessions_at_75: number;
    sessions_at_100: number;
    pct_read_to_100?: number;
    pct_to_50?: number;
    pct_to_75?: number;
    pct_to_100?: number;
  }[];
  gsc_import_snapshot?: {
    slug: string;
    impressions: number | null;
    clicks: number | null;
    ctr: number | null;
    avg_position: number | null;
    ctr_pct_display: number | null;
  }[];
  optimization?: {
    page_health_table?: {
      slug: string;
      health_score: number;
      health_band: string;
      winning_title_variant_db: string | null;
      suggested_title_variant_gsc: string | null;
      best_cta_key: string | null;
      hero_swap_applied: boolean;
    }[];
    recommendations?: {
      id: string;
      slug: string | null;
      kind: string;
      severity: string;
      title: string;
      detail: Record<string, unknown>;
      confidence: number;
      applied_at: string | null;
      created_at: string;
    }[];
  };
  notes?: string[];
  error?: string;
};

type OptimizationPayload = NonNullable<Payload["optimization"]>;
type PageHealthTableRow = NonNullable<OptimizationPayload["page_health_table"]>[number];
type ScrollSnapRow = NonNullable<Payload["scroll_depth_by_slug"]>[number];
type GscSnapRow = NonNullable<Payload["gsc_import_snapshot"]>[number];

type EnrichedHealthRow = PageHealthTableRow & {
  locationLabel: string;
  hubHref: string;
  ctrPct: number | null;
  avgPosition: number | null;
  scrollDepthPct: number | null;
  scrollDepthPrevPct: number | null;
  bookingStarts: number;
  bookingsPrevious: number | null;
  healthScorePrevious: number | null;
  impressions: number | null;
  priorityLabel: string;
  topIssue: string;
  affectedMetric: SeoAffectedMetric;
  affectedMetricLabel: string;
  issueConfidence: number;
  hasPriorPeriod: boolean;
  scoreBreakdownTitle: string | null;
};

function bandBadgeClass(band: string): string {
  if (band === "strong") return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200";
  if (band === "needs_improvement")
    return "bg-amber-100 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100";
  return "bg-rose-100 text-rose-950 dark:bg-rose-950/40 dark:text-rose-100";
}

function confidenceUi(confidence: number): { label: string; className: string } {
  if (confidence >= 0.75) {
    return {
      label: "High",
      className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/45 dark:text-emerald-200",
    };
  }
  if (confidence >= 0.55) {
    return {
      label: "Med",
      className: "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100",
    };
  }
  return {
    label: "Low",
    className: "bg-amber-100 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100",
  };
}

function scrollPctFromRow(row: ScrollSnapRow | undefined): number | null {
  if (!row) return null;
  const v = row.pct_to_100 ?? row.pct_read_to_100;
  if (v == null || Number.isNaN(v)) return null;
  return Math.round(v * 10) / 10;
}

function deltaCountLine(cur: number, prev: number | null): ReactNode {
  if (prev == null) return null;
  const d = cur - prev;
  if (d === 0) {
    return <div className="mt-0.5 text-[10px] font-medium text-zinc-400 dark:text-zinc-500">vs prior 30d · flat</div>;
  }
  const up = d > 0;
  return (
    <div
      className={cn(
        "mt-0.5 text-[10px] font-medium tabular-nums",
        up ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300",
      )}
    >
      {up ? "↑" : "↓"} {up ? "+" : ""}
      {d} vs prior 30d
    </div>
  );
}

function deltaPointsLine(cur: number | null, prev: number | null): ReactNode {
  if (cur == null || prev == null) return null;
  const d = Math.round((cur - prev) * 10) / 10;
  if (d === 0) {
    return <div className="mt-0.5 text-[10px] font-medium text-zinc-400 dark:text-zinc-500">vs prior 30d · flat</div>;
  }
  const up = d > 0;
  return (
    <div
      className={cn(
        "mt-0.5 text-[10px] font-medium tabular-nums",
        up ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300",
      )}
    >
      {up ? "↑" : "↓"} {up ? "+" : ""}
      {d} pts vs prior 30d
    </div>
  );
}

function scoreBreakdownFromRecs(
  slug: string,
  recs: NonNullable<OptimizationPayload["recommendations"]>,
): string | null {
  const rec = recs.find((r) => r.slug === slug && r.kind === "page_health");
  const d = rec?.detail;
  if (!d || typeof d !== "object") return null;
  const ctr = typeof d.ctr_component === "number" ? d.ctr_component : null;
  const sc = typeof d.scroll_component === "number" ? d.scroll_component : null;
  const cta = typeof d.cta_component === "number" ? d.cta_component : null;
  if (ctr == null && sc == null && cta == null) return null;
  const parts: string[] = [];
  if (ctr != null) parts.push(`CTR ${ctr} pts`);
  if (sc != null) parts.push(`Scroll ${sc} pts`);
  if (cta != null) parts.push(`Bookings proxy ${cta} pts`);
  return parts.join(" · ");
}

type SortKey = "score" | "ctr" | "position" | "bookings";

type TablePreset =
  | "all"
  | "money_pages"
  | "critical"
  | "easy_wins"
  | "high_conversion"
  | "low_engagement";

function matchesTablePreset(row: EnrichedHealthRow, preset: TablePreset, scroll?: ScrollSnapRow): boolean {
  switch (preset) {
    case "all":
      return true;
    case "money_pages":
      return (row.impressions ?? 0) >= 400 && (row.ctrPct ?? 99) < 2.5;
    case "critical":
      return row.health_band === "critical";
    case "easy_wins":
      return (
        row.avgPosition != null &&
        row.avgPosition >= 5 &&
        row.avgPosition <= 15 &&
        (row.impressions ?? 0) >= 150
      );
    case "high_conversion":
      return row.bookingStarts >= 2;
    case "low_engagement":
      return (row.scrollDepthPct ?? 100) < 28 || (scroll?.pct_to_50 ?? 100) < 40;
    default:
      return true;
  }
}

function IssueConfidenceBadge({ confidence }: { confidence: number }) {
  const c = confidenceUi(confidence);
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        c.className,
      )}
      title={`Heuristic confidence ${(confidence * 100).toFixed(0)}%`}
    >
      {c.label}
    </span>
  );
}

const PRESET_BUTTONS: { id: TablePreset; label: string; hint: string }[] = [
  { id: "all", label: "All rows", hint: "Clear workflow filter" },
  { id: "money_pages", label: "Money pages", hint: "High impressions, weak CTR" },
  { id: "critical", label: "Critical", hint: "Health band critical" },
  { id: "easy_wins", label: "Easy wins", hint: "Pos 5–15 with volume" },
  { id: "high_conversion", label: "High conversion", hint: "Booking starts ≥ 2" },
  { id: "low_engagement", label: "Low engagement", hint: "Shallow scroll" },
];

export default function AdminSeoInsightsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [healthFilter, setHealthFilter] = useState("");
  const [bandFilter, setBandFilter] = useState<"all" | "critical" | "needs_improvement" | "strong">("all");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDesc, setSortDesc] = useState(true);
  const [tablePreset, setTablePreset] = useState<TablePreset>("all");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
      if (!token) {
        if (!cancelled) {
          setError("Sign in as admin.");
          setLoading(false);
        }
        return;
      }
      const res = await fetch("/api/admin/seo-insights", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as Payload;
      if (cancelled) return;
      if (!res.ok) setError(json.error ?? "Failed to load SEO insights.");
      else setError(null);
      setData(res.ok ? json : null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const kpis = useMemo(() => {
    const rows = data?.optimization?.page_health_table ?? [];
    const gsc = data?.gsc_import_snapshot ?? [];
    const cta = data?.top_cta_compound ?? [];
    const bookingProxy = data?.cta_kind_booking_proxy ?? [];

    const avgHealth =
      rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.health_score, 0) / rows.length) : null;

    let bestCtrSlug: string | null = null;
    let bestCtr = -1;
    for (const r of gsc) {
      const c = r.ctr ?? 0;
      if (c > bestCtr) {
        bestCtr = c;
        bestCtrSlug = r.slug;
      }
    }

    const totalBookingStarts = bookingProxy.reduce((s, r) => s + r.sessions_with_booking_start, 0);
    const criticalPages = rows.filter((r) => r.health_band === "critical").length;
    const bestCta = cta[0] ?? null;

    const positions = gsc.map((r) => r.avg_position).filter((x): x is number => typeof x === "number" && !Number.isNaN(x));
    const avgPos =
      positions.length > 0
        ? Math.round((positions.reduce((a, b) => a + b, 0) / positions.length) * 10) / 10
        : null;

    return {
      avgHealth,
      bestCtrSlug,
      bestCtrPct: bestCtr >= 0 ? Math.round(bestCtr * 10_000) / 100 : null,
      totalBookingStarts,
      criticalPages,
      bestCta,
      avgPos,
    };
  }, [data]);

  const enrichedRows = useMemo((): EnrichedHealthRow[] => {
    const rows = data?.optimization?.page_health_table ?? [];
    const recs = data?.optimization?.recommendations ?? [];
    const gscMap = new Map((data?.gsc_import_snapshot ?? []).map((r) => [r.slug, r]));
    const scrollMap = new Map((data?.scroll_depth_by_slug ?? []).map((r) => [r.slug, r]));
    const bookingMap = new Map((data?.booking_starts_by_slug ?? []).map((r) => [r.slug, r.booking_starts]));
    const pp = data?.previous_period ?? null;
    const hasPriorPeriod = Boolean(pp && pp.rows_loaded > 0);
    const healthPrevMap = new Map((pp?.health_score_by_slug ?? []).map((x) => [x.slug, x.health_score]));
    const scrollPrevMap = new Map((pp?.scroll_depth_by_slug ?? []).map((r) => [r.slug, r]));
    const bookingPrevMap = new Map((pp?.booking_starts_by_slug ?? []).map((x) => [x.slug, x.booking_starts]));
    const q = healthFilter.trim().toLowerCase();

    return rows
      .filter((r) => {
        if (bandFilter !== "all" && r.health_band !== bandFilter) return false;
        if (!q) return true;
        const label = resolveCapeTownHubRowFromAreaInput(r.slug)?.name ?? humanizeLocationSlug(r.slug);
        return r.slug.toLowerCase().includes(q) || label.toLowerCase().includes(q);
      })
      .map((r) => {
        const hub = resolveCapeTownHubRowFromAreaInput(r.slug);
        const locationLabel = hub?.name ?? humanizeLocationSlug(r.slug);
        const hubHref = locationHubPathFromAreaInput(r.slug);
        const g = gscMap.get(r.slug);
        const sc = scrollMap.get(r.slug);
        const ctrPct = g?.ctr_pct_display ?? (g?.ctr != null ? Math.round(g.ctr * 10_000) / 100 : null);
        const scrollDepthPct = scrollPctFromRow(sc);
        const scPrev = scrollPrevMap.get(r.slug);
        const scrollDepthPrevPct = scrollPctFromRow(scPrev);
        const issue = deriveSeoIssueSignals(
          { health_band: normalizePageHealthBand(r.health_band), health_score: r.health_score },
          sc,
          g,
        );
        return {
          ...r,
          locationLabel,
          hubHref,
          ctrPct,
          avgPosition: g?.avg_position ?? null,
          scrollDepthPct,
          scrollDepthPrevPct,
          bookingStarts: bookingMap.get(r.slug) ?? 0,
          bookingsPrevious: bookingPrevMap.get(r.slug) ?? null,
          healthScorePrevious: healthPrevMap.get(r.slug) ?? null,
          impressions: g?.impressions ?? null,
          priorityLabel: issue.priorityLabel,
          topIssue: issue.topIssue,
          affectedMetric: issue.affectedMetric,
          affectedMetricLabel: issue.affectedMetricLabel,
          issueConfidence: issue.confidence,
          hasPriorPeriod,
          scoreBreakdownTitle: scoreBreakdownFromRecs(r.slug, recs),
        };
      })
      .filter((r) => matchesTablePreset(r, tablePreset, scrollMap.get(r.slug)))
      .sort((a, b) => {
        const dir = sortDesc ? 1 : -1;
        if (sortKey === "score") return (a.health_score - b.health_score) * dir;
        if (sortKey === "ctr") return ((a.ctrPct ?? -1) - (b.ctrPct ?? -1)) * dir;
        if (sortKey === "position") {
          const pa = a.avgPosition ?? 999;
          const pb = b.avgPosition ?? 999;
          return (pa - pb) * dir;
        }
        return (a.bookingStarts - b.bookingStarts) * dir;
      });
  }, [data, healthFilter, bandFilter, sortKey, sortDesc, tablePreset]);

  const momentumBundle = useMemo((): {
    risers: SeoMomentumMoverRow[];
    fallers: SeoMomentumMoverRow[];
    matrix: SeoMomentumMatrixPoint[];
  } | null => {
    const table = data?.optimization?.page_health_table;
    const pp = data?.periods?.previous_30d ?? data?.previous_period ?? null;
    if (!table?.length || !pp || pp.rows_loaded === 0) return null;

    const pc = data?.periods?.current_30d;
    const scrollRowsCur = pc?.scroll_depth_by_slug ?? data?.scroll_depth_by_slug ?? [];
    const scrollRowsPrev = pp.scroll_depth_by_slug ?? [];

    const curBook = new Map((pc?.booking_starts_by_slug ?? data?.booking_starts_by_slug ?? []).map((x) => [x.slug, x.booking_starts]));
    const prevBook = new Map(pp.booking_starts_by_slug.map((x) => [x.slug, x.booking_starts]));

    const curScroll = new Map(scrollRowsCur.map((r) => [r.slug, r]));
    const prevScroll = new Map(scrollRowsPrev.map((r) => [r.slug, r]));

    const curHealth = new Map(table.map((r) => [r.slug, r.health_score]));
    const prevHealth = new Map((pp.health_score_by_slug ?? []).map((x) => [x.slug, x.health_score]));

    const slugs = table.map((r) => r.slug);
    const movers = computeSeoMomentumMovers({
      slugs,
      curBook,
      prevBook,
      curScroll,
      prevScroll,
      curHealth,
      prevHealth,
    }).slice(0, 80);

    const enrich = (m: (typeof movers)[number]): SeoMomentumMoverRow => ({
      ...m,
      label: resolveCapeTownHubRowFromAreaInput(m.slug)?.name ?? humanizeLocationSlug(m.slug),
      hubHref: locationHubPathFromAreaInput(m.slug),
    });

    const { risers, fallers } = partitionSeoMomentumRisersFallers(movers, 5);

    const matrix: SeoMomentumMatrixPoint[] = [];
    for (const row of table) {
      const h1 = prevHealth.get(row.slug);
      if (h1 == null) continue;
      const b0 = curBook.get(row.slug) ?? 0;
      const b1 = prevBook.get(row.slug) ?? 0;
      matrix.push({
        slug: row.slug,
        label: resolveCapeTownHubRowFromAreaInput(row.slug)?.name ?? humanizeLocationSlug(row.slug),
        hubHref: locationHubPathFromAreaInput(row.slug),
        healthDelta: row.health_score - h1,
        bookingsDelta: b0 - b1,
      });
    }

    return {
      risers: risers.map(enrich),
      fallers: fallers.map(enrich),
      matrix: matrix.slice(0, 50),
    };
  }, [data]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(key === "position" ? false : true);
    }
  };

  return (
    <main className="mx-auto max-w-6xl space-y-10 pb-16">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">SEO command center</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Executive view on location hub performance: GSC snapshots, scroll depth, CTA → booking proxy, and automated
          optimizer output. Use the table to prioritize fixes before touching content in the CMS.
        </p>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
          ))}
        </div>
      ) : error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </p>
      ) : (
        <>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Current 30d · since {data?.since ?? "—"}
            {data?.until ? ` · through ${new Date(data.until).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}` : ""} ·{" "}
            {data?.rows_loaded ?? 0} events
            {data?.previous_period ? (
              <>
                {" "}
                · Prior 30d · since {data.previous_period.since} · {data.previous_period.rows_loaded} events (non-overlapping)
              </>
            ) : null}
          </p>

          <section aria-label="Executive KPIs" className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Overview</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <SeoInsightsKpiCard
                title="Avg SEO health"
                value={kpis.avgHealth != null ? String(kpis.avgHealth) : "—"}
                subtitle="Mean page health score"
                status={kpis.avgHealth != null ? scoreToKpiStatus(kpis.avgHealth) : "neutral"}
              />
              <SeoInsightsKpiCard
                title="Best CTR suburb"
                value={kpis.bestCtrSlug ? humanizeLocationSlug(kpis.bestCtrSlug) : "—"}
                subtitle={kpis.bestCtrPct != null ? `${kpis.bestCtrPct}% CTR (GSC)` : "Import GSC metrics"}
                status={kpis.bestCtrPct != null && kpis.bestCtrPct >= 4 ? "good" : kpis.bestCtrPct != null ? "neutral" : "warn"}
              />
              <SeoInsightsKpiCard
                title="Booking starts"
                value={String(kpis.totalBookingStarts)}
                subtitle="Sum of CTA-location → start_booking proxy"
                status={kpis.totalBookingStarts >= 20 ? "good" : kpis.totalBookingStarts >= 5 ? "neutral" : "warn"}
              />
              <SeoInsightsKpiCard
                title="Critical pages"
                value={String(kpis.criticalPages)}
                subtitle="Health band · critical"
                status={kpis.criticalPages === 0 ? "good" : kpis.criticalPages <= 3 ? "warn" : "bad"}
              />
              <SeoInsightsKpiCard
                title="Best CTA"
                value={kpis.bestCta ? `${kpis.bestCta.count}` : "—"}
                subtitle={kpis.bestCta ? kpis.bestCta.key.slice(0, 42) + (kpis.bestCta.key.length > 42 ? "…" : "") : "No clicks yet"}
                status={kpis.bestCta && kpis.bestCta.count >= 30 ? "good" : kpis.bestCta ? "neutral" : "warn"}
              />
              <SeoInsightsKpiCard
                title="Avg position"
                value={kpis.avgPos != null ? String(kpis.avgPos) : "—"}
                subtitle="Mean GSC position (imported rows)"
                status={kpis.avgPos != null && kpis.avgPos <= 8 ? "good" : kpis.avgPos != null && kpis.avgPos <= 14 ? "neutral" : "warn"}
              />
            </div>
          </section>

          <SeoOpportunityMap gscRows={data?.gsc_import_snapshot ?? []} />

          {momentumBundle ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <SeoMomentumRisersFallers risers={momentumBundle.risers} fallers={momentumBundle.fallers} />
              <SeoMomentumMatrix points={momentumBundle.matrix} />
            </div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            <SeoInsightsTopOpportunities rows={data?.gsc_import_snapshot ?? []} />
            <Card className="border-zinc-200/90 shadow-sm dark:border-zinc-800">
              <CardHeader>
                <CardTitle className="text-base">Quick actions</CardTitle>
                <CardDescription>High-leverage levers — wire automations or edit hubs manually.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-2 text-sm">
                  {[
                    ["Generate SEO title", "Run `/api/cron/seo-optimization` with title auto-apply env flags."],
                    ["FAQ schema + blocks", "Enrich suburb hub FAQ; validate JSON-LD in Search Console."],
                    ["Internal links", "Cross-link related suburbs + service pillars from body copy."],
                    ["Hero / CTA test", "Review `seo_auto_hub_ui_patch` when hero swap confidence is high."],
                  ].map(([t, d]) => (
                    <li
                      key={t}
                      className="rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/40"
                    >
                      <span className="font-medium text-zinc-900 dark:text-zinc-50">{t}</span>
                      <span className="mt-0.5 block text-xs text-zinc-600 dark:text-zinc-400">{d}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          <Card className="border-zinc-200/90 shadow-sm dark:border-zinc-800">
            <CardHeader className="space-y-1 border-b border-zinc-100 pb-4 dark:border-zinc-800">
              <CardTitle className="text-lg font-semibold tracking-tight">Location hub performance</CardTitle>
              <CardDescription>
                Weighted health score with imported GSC, scroll milestones, and booking-start proxy. When a prior 30
                day window is available, deltas under score / bookings / scroll compare to that non-overlapping period.
                GSC remains a static import (no period delta until time-series GSC is stored).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Workflow presets
                </p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_BUTTONS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      title={p.hint}
                      onClick={() => {
                        setTablePreset(p.id);
                        if (p.id === "critical") setBandFilter("critical");
                        else if (p.id !== "all") setBandFilter("all");
                      }}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        tablePreset === p.id
                          ? "border-blue-600 bg-blue-50 text-blue-900 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-100"
                          : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-600",
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
                <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Search location
                  <input
                    value={healthFilter}
                    onChange={(e) => setHealthFilter(e.target.value)}
                    placeholder="Sea Point, claremont…"
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                  />
                </label>
                <label className="flex w-full max-w-xs flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Health band
                  <select
                    value={bandFilter}
                    onChange={(e) => {
                      setBandFilter(e.target.value as typeof bandFilter);
                      setTablePreset("all");
                    }}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                  >
                    <option value="all">All bands</option>
                    <option value="critical">Critical</option>
                    <option value="needs_improvement">Needs improvement</option>
                    <option value="strong">Strong</option>
                  </select>
                </label>
              </div>

              <div className="max-h-[520px] overflow-auto rounded-xl border border-zinc-200/90 dark:border-zinc-800">
                <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-zinc-50/95 text-xs font-semibold uppercase tracking-wide text-zinc-500 shadow-sm dark:bg-zinc-900/95 dark:text-zinc-400">
                    <tr className="border-b border-zinc-200 dark:border-zinc-700">
                      <th className="px-3 py-3">Location</th>
                      <th className="px-3 py-3">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 font-semibold hover:text-blue-700 dark:hover:text-blue-400"
                          onClick={() => toggleSort("score")}
                        >
                          SEO score
                          {sortKey === "score" ? <span className="text-blue-600">{sortDesc ? "↓" : "↑"}</span> : null}
                        </button>
                      </th>
                      <th className="px-3 py-3">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 font-semibold hover:text-blue-700 dark:hover:text-blue-400"
                          onClick={() => toggleSort("ctr")}
                        >
                          CTR
                          {sortKey === "ctr" ? <span className="text-blue-600">{sortDesc ? "↓" : "↑"}</span> : null}
                        </button>
                      </th>
                      <th className="px-3 py-3">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 font-semibold hover:text-blue-700 dark:hover:text-blue-400"
                          onClick={() => toggleSort("position")}
                        >
                          Avg pos.
                          {sortKey === "position" ? <span className="text-blue-600">{sortDesc ? "↓" : "↑"}</span> : null}
                        </button>
                      </th>
                      <th className="px-3 py-3">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 font-semibold hover:text-blue-700 dark:hover:text-blue-400"
                          onClick={() => toggleSort("bookings")}
                        >
                          Bookings
                          {sortKey === "bookings" ? <span className="text-blue-600">{sortDesc ? "↓" : "↑"}</span> : null}
                        </button>
                      </th>
                      <th className="px-3 py-3">Scroll %→100</th>
                      <th className="px-3 py-3">Priority</th>
                      <th className="px-3 py-3">Signal</th>
                      <th className="px-3 py-3" title="Heuristic strength of the detected issue">
                        Conf.
                      </th>
                      <th className="px-3 py-3">Top issue</th>
                      <th className="px-3 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {enrichedRows.map((r) => (
                      <tr key={r.slug} className="bg-white hover:bg-zinc-50/80 dark:bg-zinc-950/20 dark:hover:bg-zinc-900/40">
                        <td className="px-3 py-3">
                          <div className="font-semibold text-zinc-900 dark:text-zinc-50">{r.locationLabel}</div>
                          <div className="mt-0.5 font-mono text-[10px] text-zinc-500">{r.slug}</div>
                        </td>
                        <td className="px-3 py-3 tabular-nums">
                          <span
                            className="font-semibold text-zinc-900 dark:text-zinc-50"
                            title={r.scoreBreakdownTitle ?? "Weighted CTR + scroll + booking proxy (see optimizer recommendations)."}
                          >
                            {r.health_score}
                          </span>
                          <div className="mt-1">
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                bandBadgeClass(r.health_band),
                              )}
                            >
                              {r.health_band.replace(/_/g, " ")}
                            </span>
                          </div>
                          {r.hasPriorPeriod ? deltaCountLine(r.health_score, r.healthScorePrevious) : null}
                        </td>
                        <td className="px-3 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">
                          {r.ctrPct != null ? `${r.ctrPct}%` : "—"}
                        </td>
                        <td className="px-3 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">
                          {r.avgPosition != null ? r.avgPosition.toFixed(1) : "—"}
                        </td>
                        <td className="px-3 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">
                          <div>{r.bookingStarts}</div>
                          {r.hasPriorPeriod ? deltaCountLine(r.bookingStarts, r.bookingsPrevious) : null}
                        </td>
                        <td className="px-3 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">
                          <div>{r.scrollDepthPct != null ? `${r.scrollDepthPct}%` : "—"}</div>
                          {r.hasPriorPeriod ? deltaPointsLine(r.scrollDepthPct, r.scrollDepthPrevPct) : null}
                        </td>
                        <td className="px-3 py-3 text-xs font-medium text-zinc-700 dark:text-zinc-300">{r.priorityLabel}</td>
                        <td className="px-3 py-3">
                          <span
                            className={cn(
                              "inline-flex max-w-[7.5rem] rounded-full px-2 py-0.5 text-[10px] font-semibold leading-tight",
                              affectedMetricBadgeClass(r.affectedMetric),
                            )}
                            title="Which funnel stage this issue primarily pressures"
                          >
                            {r.affectedMetricLabel}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <IssueConfidenceBadge confidence={r.issueConfidence} />
                        </td>
                        <td className="max-w-[220px] px-3 py-3 text-xs leading-snug text-zinc-600 dark:text-zinc-400">
                          {r.topIssue}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Link
                            href={r.hubHref}
                            className="inline-flex text-xs font-semibold text-blue-700 underline-offset-4 hover:underline dark:text-blue-400"
                          >
                            Open hub
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {enrichedRows.length === 0 ? (
                  <div className="p-6">
                    <SeoInsightsEmptyState
                      title="No rows match your filters"
                      description="Clear the search or set the band filter to “All bands” to see the full hub list."
                    />
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-200/90 shadow-sm dark:border-zinc-800">
            <CardHeader>
              <CardTitle className="text-lg font-semibold tracking-tight">Recommendations queue</CardTitle>
              <CardDescription>Latest rows from `seo_insights_recommendations` (cron: `/api/cron/seo-optimization`).</CardDescription>
            </CardHeader>
            <CardContent>
              {(data?.optimization?.recommendations?.length ?? 0) === 0 ? (
                <SeoInsightsEmptyState
                  title="No recommendations generated yet"
                  description="The optimizer writes recommendations when it finds page health, scroll, CTR, or trust issues. Run the cron job against production events to populate this queue."
                />
              ) : (
                <ul className="max-h-96 space-y-3 overflow-auto text-sm">
                  {(data?.optimization?.recommendations ?? []).map((rec) => (
                    <li
                      key={rec.id}
                      className="rounded-xl border border-zinc-200 bg-zinc-50/90 px-4 py-3 shadow-sm transition hover:border-blue-200/80 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-blue-900/40"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-50">{rec.title}</span>
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{rec.severity}</span>
                      </div>
                      <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                        {rec.kind}
                        {rec.slug ? (
                          <>
                            {" "}
                            ·{" "}
                            <span className="font-medium text-zinc-800 dark:text-zinc-200">
                              {resolveCapeTownHubRowFromAreaInput(rec.slug)?.name ?? humanizeLocationSlug(rec.slug)}
                            </span>
                            <span className="ml-1 font-mono text-[10px] text-zinc-500">({rec.slug})</span>
                          </>
                        ) : null}{" "}
                        · confidence {(rec.confidence * 100).toFixed(0)}%
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-zinc-200/90 shadow-sm dark:border-zinc-800">
              <CardHeader>
                <CardTitle className="text-base">Top suburbs (SEO CTA clicks)</CardTitle>
                <CardDescription>From `seo_cta_click` with `page_type: seo_location`.</CardDescription>
              </CardHeader>
              <CardContent>
                {(data?.top_suburbs_by_cta_clicks?.length ?? 0) === 0 ? (
                  <SeoInsightsEmptyState
                    title="No suburb CTA clicks in this window"
                    description="Instrumented hub pages will populate this list as users engage with SEO CTAs."
                  />
                ) : (
                  <ul className="max-h-72 space-y-2 overflow-auto text-sm">
                    {(data?.top_suburbs_by_cta_clicks ?? []).map((r) => (
                      <li
                        key={r.suburb}
                        className="flex justify-between gap-4 border-b border-zinc-100 py-2 dark:border-zinc-800"
                      >
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">{r.suburb}</span>
                        <span className="tabular-nums font-semibold text-zinc-700 dark:text-zinc-300">{r.seo_cta_clicks}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="border-zinc-200/90 shadow-sm dark:border-zinc-800">
              <CardHeader>
                <CardTitle className="text-base">Imported GSC · highest CTR</CardTitle>
                <CardDescription>Manual `gscMetrics` entries (CTR stored as fraction; column shows %).</CardDescription>
              </CardHeader>
              <CardContent>
                {(data?.gsc_import_snapshot?.length ?? 0) === 0 ? (
                  <SeoInsightsEmptyState
                    title="No GSC snapshot rows"
                    description="Add `gscMetrics` to your location SEO feedback JSON so CTR and average position flow into health scoring and this leaderboard."
                  />
                ) : (
                  <ul className="max-h-72 space-y-2 overflow-auto text-sm">
                    {(data?.gsc_import_snapshot ?? []).map((r) => (
                      <li key={r.slug} className="rounded-lg border border-zinc-100 px-3 py-2 dark:border-zinc-800">
                        <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {humanizeLocationSlug(r.slug)}
                        </div>
                        <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                          CTR {r.ctr_pct_display != null ? `${r.ctr_pct_display}%` : "—"} · pos{" "}
                          {r.avg_position != null ? r.avg_position.toFixed(1) : "—"} · clicks {r.clicks ?? "—"} · impr.{" "}
                          {r.impressions ?? "—"}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-zinc-200/90 shadow-sm dark:border-zinc-800">
            <CardHeader>
              <CardTitle className="text-base">Most clicked CTAs</CardTitle>
              <CardDescription>Grouped by `cta_kind · cta_location · cta_label`.</CardDescription>
            </CardHeader>
            <CardContent>
              {(data?.top_cta_compound?.length ?? 0) === 0 ? (
                <SeoInsightsEmptyState
                  title="No CTA compound clicks"
                  description="Once SEO hub instrumentation records compound keys, winners surface here for copy tests."
                />
              ) : (
                <ul className="max-h-80 space-y-2 overflow-auto text-sm">
                  {(data?.top_cta_compound ?? []).map((r) => (
                    <li
                      key={r.key}
                      className="flex justify-between gap-4 rounded-lg border border-zinc-100 px-3 py-2 dark:border-zinc-800"
                    >
                      <span className="text-zinc-800 dark:text-zinc-200">{r.key}</span>
                      <span className="shrink-0 tabular-nums font-semibold text-zinc-700 dark:text-zinc-300">{r.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-zinc-200/90 shadow-sm dark:border-zinc-800">
              <CardHeader>
                <CardTitle className="text-base">Scroll depth · drop-off proxy</CardTitle>
                <CardDescription>
                  Distinct sessions reaching each milestone; `%→100` uses 100% readers ÷ 25% cohort.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-96 overflow-auto rounded-lg border border-zinc-100 text-xs dark:border-zinc-800">
                  <table className="w-full border-collapse text-left">
                    <thead className="sticky top-0 bg-zinc-50 text-[11px] font-semibold uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                      <tr className="border-b border-zinc-200 dark:border-zinc-700">
                        <th className="px-2 py-2">Location</th>
                        <th className="px-2 py-2">25%</th>
                        <th className="px-2 py-2">50%</th>
                        <th className="px-2 py-2">75%</th>
                        <th className="px-2 py-2">100%</th>
                        <th className="px-2 py-2">%→100</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.scroll_depth_by_slug ?? []).map((r) => (
                        <tr key={r.slug} className="border-b border-zinc-100 dark:border-zinc-800">
                          <td className="px-2 py-2 font-medium text-zinc-800 dark:text-zinc-200">
                            {humanizeLocationSlug(r.slug)}
                          </td>
                          <td className="px-2 py-2 tabular-nums">{r.sessions_at_25}</td>
                          <td className="px-2 py-2 tabular-nums">{r.sessions_at_50}</td>
                          <td className="px-2 py-2 tabular-nums">{r.sessions_at_75}</td>
                          <td className="px-2 py-2 tabular-nums">{r.sessions_at_100}</td>
                          <td className="px-2 py-2 tabular-nums">
                            {r.pct_to_100 != null ? `${r.pct_to_100}%` : `${r.pct_read_to_100 ?? 0}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card className="border-zinc-200/90 shadow-sm dark:border-zinc-800">
              <CardHeader>
                <CardTitle className="text-base">CTA kind · location → booking start</CardTitle>
                <CardDescription>
                  Distinct sessions with that `cta_kind`+`cta_location` pair that also fired `start_booking`.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="max-h-96 space-y-2 overflow-auto text-sm">
                  {(data?.cta_kind_booking_proxy ?? []).map((r) => (
                    <li
                      key={r.key ?? `${r.cta_kind}-${r.cta_location ?? ""}`}
                      className="flex flex-col gap-0.5 rounded-lg border border-zinc-100 px-3 py-2 dark:border-zinc-800"
                    >
                      <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                        {r.cta_kind}
                        {r.cta_location ? (
                          <span className="font-normal text-zinc-600 dark:text-zinc-400"> · {r.cta_location}</span>
                        ) : null}
                      </span>
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">
                        sessions {r.distinct_sessions} · booking {r.sessions_with_booking_start} · {r.conversion_pct}%
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {data?.notes?.length ? (
            <ul id="seo-notes" className="list-disc space-y-1 pl-5 text-xs text-zinc-500 dark:text-zinc-400">
              {data.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </main>
  );
}
