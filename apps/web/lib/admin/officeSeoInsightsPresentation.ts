import { humanizeLocationSlug } from "@/lib/seo/humanize-location-slug";

export type SeoInsightsGscRow = {
  slug: string;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  avg_position: number | null;
  ctr_pct_display: number | null;
};

export type SeoInsightsHealthRow = {
  slug: string;
  health_score: number;
  health_band: string;
};

export type SeoInsightsRecommendation = {
  id: string;
  slug: string | null;
  severity: string;
  title: string;
  detail: unknown;
};

export type SeoInsightsPayload = {
  since?: string;
  until?: string;
  rows_loaded?: number;
  gsc_import_snapshot: SeoInsightsGscRow[];
  gsc_import_count?: number;
  gsc_config_source?: "database" | "env" | "file" | "none";
  gsc_synced_at?: string | null;
  booking_starts_by_slug?: Array<{ slug: string; booking_starts: number }>;
  optimization: {
    page_health_table: SeoInsightsHealthRow[];
    recommendations: SeoInsightsRecommendation[];
  };
  periods?: {
    previous_30d?: { health_score_by_slug?: Array<{ slug: string; health_score: number }> };
  };
};

export type OfficeSeoPageRow = {
  slug: string;
  label: string;
  healthScore: number;
  healthBand: string;
  healthDelta: number | null;
  impressions: number | null;
  clicks: number | null;
  ctrPct: number | null;
  avgPosition: number | null;
  bookingStarts: number;
};

export type OfficeSeoKpis = {
  pagesTracked: number;
  avgHealth: number | null;
  criticalPages: number;
  totalBookingStarts: number;
  gscPages: number;
  avgPosition: number | null;
};

function bandClass(band: string): string {
  if (band === "strong") return "bg-emerald-100 text-emerald-800";
  if (band === "needs_improvement") return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-800";
}

export function seoHealthBandClass(band: string): string {
  return bandClass(band);
}

export function formatRecommendationDetail(detail: unknown): string | null {
  if (detail == null) return null;
  if (typeof detail === "string") return detail.trim() || null;
  if (typeof detail !== "object") return String(detail);
  const d = detail as Record<string, unknown>;
  if (typeof d.hint === "string") return d.hint;
  const parts: string[] = [];
  if (typeof d.score === "number") parts.push(`Score ${d.score}`);
  if (typeof d.band === "string") parts.push(String(d.band).replace(/_/g, " "));
  if (typeof d.ctr_component === "number") parts.push(`CTR ${d.ctr_component} pts`);
  if (typeof d.scroll_component === "number") parts.push(`Scroll ${d.scroll_component} pts`);
  if (typeof d.cta_component === "number") parts.push(`Bookings ${d.cta_component} pts`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function buildOfficeSeoKpis(data: SeoInsightsPayload | null): OfficeSeoKpis {
  const rows = data?.optimization.page_health_table ?? [];
  const gsc = data?.gsc_import_snapshot ?? [];
  const bookingStarts = data?.booking_starts_by_slug ?? [];

  const avgHealth =
    rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.health_score, 0) / rows.length) : null;
  const positions = gsc
    .map((r) => r.avg_position)
    .filter((x): x is number => typeof x === "number" && !Number.isNaN(x));
  const avgPosition =
    positions.length > 0
      ? Math.round((positions.reduce((a, b) => a + b, 0) / positions.length) * 10) / 10
      : null;

  return {
    pagesTracked: rows.length,
    avgHealth,
    criticalPages: rows.filter((r) => r.health_band === "critical").length,
    totalBookingStarts: bookingStarts.reduce((s, r) => s + r.booking_starts, 0),
    gscPages: gsc.length,
    avgPosition,
  };
}

export function buildOfficeSeoPageRows(data: SeoInsightsPayload | null): OfficeSeoPageRow[] {
  const rows = data?.optimization.page_health_table ?? [];
  const gscMap = new Map((data?.gsc_import_snapshot ?? []).map((r) => [r.slug, r]));
  const bookingMap = new Map((data?.booking_starts_by_slug ?? []).map((r) => [r.slug, r.booking_starts]));
  const prevMap = new Map(
    (data?.periods?.previous_30d?.health_score_by_slug ?? []).map((r) => [r.slug, r.health_score]),
  );

  return rows
    .map((row) => {
      const g = gscMap.get(row.slug);
      const prev = prevMap.get(row.slug);
      return {
        slug: row.slug,
        label: humanizeLocationSlug(row.slug),
        healthScore: row.health_score,
        healthBand: row.health_band,
        healthDelta: prev != null ? row.health_score - prev : null,
        impressions: g?.impressions ?? null,
        clicks: g?.clicks ?? null,
        ctrPct: g?.ctr_pct_display ?? (g?.ctr != null ? Math.round(g.ctr * 10_000) / 100 : null),
        avgPosition:
          g?.avg_position != null && !Number.isNaN(g.avg_position) ? Math.round(g.avg_position * 10) / 10 : null,
        bookingStarts: bookingMap.get(row.slug) ?? 0,
      };
    })
    .sort((a, b) => {
      const aHasGsc = a.impressions != null || a.avgPosition != null;
      const bHasGsc = b.impressions != null || b.avgPosition != null;
      if (aHasGsc !== bHasGsc) return aHasGsc ? -1 : 1;
      return a.healthScore - b.healthScore || b.bookingStarts - a.bookingStarts;
    });
}
