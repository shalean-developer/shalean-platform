import { CAPE_TOWN_LOCATIONS } from "@/lib/seo/capeTownLocations";
import type { LocationGscMetricSnapshot } from "@/lib/seo/location-seo-feedback";
import {
  getExplicitEnvTitleVariant,
  getLocationGscMetrics,
  getLocationGscVariantMetrics,
  hasManualLocationMetaTitle,
} from "@/lib/seo/location-seo-feedback";
import type { LocationTitleVariantId } from "@/lib/seo/location-title-variants";
import type { AggregatedSeoEvents, ScrollFunnelRow } from "@/lib/seo/optimization/aggregate-seo-events";

/** Minimum impressions per variant row before it qualifies for a title winner test. */
export const TITLE_VARIANT_MIN_IMPRESSIONS = 100;
/** Relative CTR lift (best vs runner-up) required to call a title-variant winner. */
export const TITLE_VARIANT_MIN_REL_CTR_LIFT = 0.1;
/** Minimum sessions at 25% scroll depth before scroll diagnostics are considered stable. */
export const SCROLL_MIN_SESSIONS_BASELINE = 20;
/** Share of sessions reaching 50% depth (vs 25%) — below this flags weak hero/intro. */
export const SCROLL_WEAK_HERO_PCT_50 = 40;
/** Share reaching 75% depth — below flags mid-page engagement. */
export const SCROLL_WEAK_MID_PCT_75 = 20;
/** Minimum combined hero `book_now` clicks before swapping button order. */
export const HERO_BOOK_MIN_TOTAL_CLICKS = 40;
/** Winner hero label must exceed the alternate by this factor. */
export const HERO_BOOK_DOMINANCE_RATIO = 1.15;
export const OUTLINE_SECONDARY_HERO_LABEL = "Book now — see total first";
/** Minimum sessions for a `(cta_kind, cta_location)` cell to join global promotion logic. */
export const CTA_GLOBAL_MIN_SESSIONS = 40;
/** Relative conversion lift vs runner-up for global CTA promotion signal. */
export const CTA_GLOBAL_MIN_REL_CONV_LIFT = 0.15;
/** Minimum sessions for per-slug “best CTA” attribution. */
export const CTA_SLUG_MIN_SESSIONS = 12;

export type PageHealthBand = "strong" | "needs_improvement" | "critical" | "insufficient_data";

export type PageHealthDataGaps = {
  scroll_sessions_at_25: number;
  scroll_sessions_needed: number;
  scroll_ready: boolean;
  cta_sessions: number;
  cta_sessions_needed: number;
  cta_ready: boolean;
  gsc_impressions: number | null;
  ctr_pct: number | null;
  ctr_target_pct: number | null;
  avg_position: number | null;
  missing_signals: string[];
};

export type PageHealthComponents = {
  ctr: number;
  scroll: number;
  cta: number;
};

export type PageHealthRow = {
  slug: string;
  score: number;
  band: PageHealthBand;
  components: PageHealthComponents;
  data_gaps: PageHealthDataGaps;
  winning_title_variant: LocationTitleVariantId | null;
  best_cta_key: string | null;
};

export type SeoRecommendationInsert = {
  slug: string | null;
  kind: string;
  severity: "info" | "warn" | "critical";
  title: string;
  detail: Record<string, unknown>;
  confidence: number;
};

export type TitleAutoCandidate = {
  slug: string;
  variant: LocationTitleVariantId;
  confidence: number;
  reason: string;
};

export type HubUiAutoPatch = {
  slug: string;
  swap_hero_book_ctas: boolean;
  confidence: number;
  reason: string;
};

export type SeoOptimizationEngineOptions = {
  /** DB-synced metrics merged with env/file fallback; DB wins per slug. */
  gscMetricsBySlug?: ReadonlyMap<string, LocationGscMetricSnapshot>;
};

function resolveGscMetrics(
  slug: string,
  gscMetricsBySlug?: ReadonlyMap<string, LocationGscMetricSnapshot>,
): LocationGscMetricSnapshot | null {
  return gscMetricsBySlug?.get(slug) ?? getLocationGscMetrics(slug);
}

export type SeoOptimizationEngineResult = {
  titleAutoCandidates: TitleAutoCandidate[];
  hubUiPatches: HubUiAutoPatch[];
  recommendations: SeoRecommendationInsert[];
  pageHealth: PageHealthRow[];
};

function bandFromScore(score: number): PageHealthBand {
  if (score >= 80) return "strong";
  if (score >= 50) return "needs_improvement";
  return "critical";
}

function pickVariantWinnerFromGsc(slug: string): TitleAutoCandidate | null {
  if (hasManualLocationMetaTitle(slug)) return null;
  if (getExplicitEnvTitleVariant(slug)) return null;

  const vm = getLocationGscVariantMetrics(slug);
  if (!vm) return null;

  type Entry = { variant: LocationTitleVariantId; ctr: number; impressions: number };
  const entries: Entry[] = [];
  for (const id of ["A", "B", "C"] as const) {
    const m = vm[id];
    if (!m || typeof m !== "object") continue;
    const impressions = typeof m.impressions === "number" ? m.impressions : 0;
    const ctr = typeof m.ctr === "number" ? m.ctr : null;
    if (ctr == null || impressions < TITLE_VARIANT_MIN_IMPRESSIONS) continue;
    entries.push({ variant: id, ctr, impressions });
  }
  if (entries.length < 2) return null;

  entries.sort((a, b) => b.ctr - a.ctr);
  const best = entries[0]!;
  const second = entries[1]!;
  if (second.ctr <= 0) return null;
  const relLift = (best.ctr - second.ctr) / second.ctr;
  if (relLift < TITLE_VARIANT_MIN_REL_CTR_LIFT) return null;

  const confidence = Math.min(
    1,
    Math.min(best.impressions, second.impressions) / 400,
    relLift,
  );

  return {
    slug,
    variant: best.variant,
    confidence: Math.round(confidence * 1000) / 1000,
    reason: `GSC variant CTR lift ${Math.round(relLift * 100)}% vs runner-up (${best.variant} ${(best.ctr * 100).toFixed(2)}% vs ${second.variant} ${(second.ctr * 100).toFixed(2)}%).`,
  };
}

function heroSwapFromAggregates(aggregated: AggregatedSeoEvents): HubUiAutoPatch[] {
  const bySlug = new Map<string, Map<string, number>>();
  for (const row of aggregated.heroBookNowBySlugLabel) {
    if (!bySlug.has(row.slug)) bySlug.set(row.slug, new Map());
    bySlug.get(row.slug)!.set(row.label, row.clicks);
  }

  const patches: HubUiAutoPatch[] = [];
  for (const [slug, labelMap] of bySlug) {
    const entries = [...labelMap.entries()].sort((a, b) => b[1] - a[1]);
    if (entries.length < 2) continue;
    const [topLabel, topC] = entries[0]!;
    const [, secondC] = entries[1]!;
    const total = topC + secondC;
    if (total < HERO_BOOK_MIN_TOTAL_CLICKS) continue;
    const low = Math.min(topC, secondC);
    const high = Math.max(topC, secondC);
    if (low <= 0 || high / low < HERO_BOOK_DOMINANCE_RATIO) continue;

    const labels = new Set(labelMap.keys());
    if (!labels.has(OUTLINE_SECONDARY_HERO_LABEL)) continue;

    const swap = topLabel === OUTLINE_SECONDARY_HERO_LABEL;
    const confidence = Math.min(1, total / 160);

    patches.push({
      slug,
      swap_hero_book_ctas: swap,
      confidence: Math.round(confidence * 1000) / 1000,
      reason: swap
        ? `Hero outline CTA (“${OUTLINE_SECONDARY_HERO_LABEL}”) wins clicks (${topC} vs ${secondC}); promote order + visual weight.`
        : `Primary hero label wins clicks; keep default hero order (${topC} vs ${secondC}).`,
    });
  }
  return patches;
}

/** Expected organic CTR (0–1) for a mean Search Console position. */
export function expectedCtrForPosition(position: number): number {
  if (position <= 3) return 0.12;
  if (position <= 10) return 0.055;
  if (position <= 20) return 0.03;
  if (position <= 40) return 0.018;
  return 0.01;
}

export function expectedCtrPctForPosition(position: number): number {
  return Math.round(expectedCtrForPosition(position) * 10_000) / 100;
}

function gscCtrScore(metrics: LocationGscMetricSnapshot | null): number {
  if (!metrics || typeof metrics.ctr !== "number") return 0;
  const position =
    typeof metrics.avg_position === "number" && metrics.avg_position > 0 ? metrics.avg_position : 25;
  const expected = expectedCtrForPosition(position);
  if (expected <= 0) return 0;
  const ratio = metrics.ctr / expected;
  return Math.min(40, Math.round(ratio * 30 * 10) / 10);
}

function scrollCompositeScore(pct50: number, pct75: number, pct100: number): number {
  const s =
    Math.min(1, pct50 / 100) * 10 + Math.min(1, pct75 / 100) * 10 + Math.min(1, pct100 / 100) * 15;
  return Math.min(35, s);
}

const CTA_SUBURB_MIN_SESSIONS = 10;

function suburbCtaSessions(
  suburbName: string | undefined,
  suburbRollup: AggregatedSeoEvents["suburbCtaBooking"],
): number {
  if (!suburbName) return 0;
  return suburbRollup.find((r) => r.suburb === suburbName)?.sessions_with_cta ?? 0;
}

function suburbBookingScore(suburbName: string | undefined, suburbRollup: AggregatedSeoEvents["suburbCtaBooking"]): number {
  const sessions = suburbCtaSessions(suburbName, suburbRollup);
  if (sessions < CTA_SUBURB_MIN_SESSIONS) return 0;
  const row = suburbRollup.find((r) => r.suburb === suburbName);
  if (!row) return 0;
  return Math.min(25, row.conversion_pct * 2.5);
}

function ctrPctFromGsc(metrics: LocationGscMetricSnapshot | null): number | null {
  if (!metrics || typeof metrics.ctr !== "number") return null;
  return Math.round(metrics.ctr * 10_000) / 100;
}

function buildPageHealthDataGaps(
  gsc: LocationGscMetricSnapshot | null,
  scroll: ScrollFunnelRow | undefined,
  ctaSessions: number,
): PageHealthDataGaps {
  const scrollSessions = scroll?.sessions_at_25 ?? 0;
  const scrollReady = scrollSessions >= SCROLL_MIN_SESSIONS_BASELINE;
  const ctaReady = ctaSessions >= CTA_SUBURB_MIN_SESSIONS;
  const position =
    gsc && typeof gsc.avg_position === "number" && gsc.avg_position > 0 ? gsc.avg_position : null;
  const ctrPct = ctrPctFromGsc(gsc);
  const ctrTargetPct = position != null ? expectedCtrPctForPosition(position) : null;
  const missing: string[] = [];

  if (!gsc?.impressions) missing.push("Sync GSC or add search metrics for this slug");
  if (!scrollReady) {
    missing.push(
      `Need ${Math.max(0, SCROLL_MIN_SESSIONS_BASELINE - scrollSessions)} more scroll sessions (25% depth)`,
    );
  }
  if (!ctaReady) {
    missing.push(`Need ${Math.max(0, CTA_SUBURB_MIN_SESSIONS - ctaSessions)} more CTA click sessions`);
  }
  if (ctrPct != null && ctrTargetPct != null && ctrPct < ctrTargetPct) {
    missing.push(`Raise CTR toward ${ctrTargetPct}% for position #${position?.toFixed(1) ?? "?"}`);
  }

  return {
    scroll_sessions_at_25: scrollSessions,
    scroll_sessions_needed: SCROLL_MIN_SESSIONS_BASELINE,
    scroll_ready: scrollReady,
    cta_sessions: ctaSessions,
    cta_sessions_needed: CTA_SUBURB_MIN_SESSIONS,
    cta_ready: ctaReady,
    gsc_impressions: typeof gsc?.impressions === "number" ? gsc.impressions : null,
    ctr_pct: ctrPct,
    ctr_target_pct: ctrTargetPct,
    avg_position: position,
    missing_signals: missing,
  };
}

function resolveHealthBand(
  score: number,
  ctx: {
    hasGsc: boolean;
    scrollSessions: number;
    ctaSessions: number;
    ctrPart: number;
  },
): PageHealthBand {
  const raw = bandFromScore(score);
  const hasEngagementBaseline =
    ctx.scrollSessions >= SCROLL_MIN_SESSIONS_BASELINE || ctx.ctaSessions >= CTA_SUBURB_MIN_SESSIONS;

  if (raw !== "critical") return raw;

  if (!ctx.hasGsc && !hasEngagementBaseline) return "insufficient_data";
  if (ctx.hasGsc && !hasEngagementBaseline && ctx.ctrPart >= 20) return "needs_improvement";
  if (ctx.hasGsc && !hasEngagementBaseline && ctx.ctrPart >= 12) return "insufficient_data";
  return "critical";
}

function computeSlugHealth(
  slug: string,
  aggregated: AggregatedSeoEvents,
  scrollMap: Map<string, ScrollFunnelRow>,
  suburbBySlug: Map<string, string>,
  titleAutoCandidates: TitleAutoCandidate[],
  slugBestCta: Map<string, { key: string; conversion_pct: number; sessions: number }>,
  gscMetricsBySlug?: ReadonlyMap<string, LocationGscMetricSnapshot>,
): PageHealthRow {
  const gsc = resolveGscMetrics(slug, gscMetricsBySlug);
  const scroll = scrollMap.get(slug);
  const suburb = suburbBySlug.get(slug);
  const ctaSessions = suburbCtaSessions(suburb, aggregated.suburbCtaBooking);
  const ctrPart = gscCtrScore(gsc);
  const scrollPart =
    scroll && scroll.sessions_at_25 >= SCROLL_MIN_SESSIONS_BASELINE
      ? scrollCompositeScore(scroll.pct_to_50, scroll.pct_to_75, scroll.pct_to_100)
      : 0;
  const ctaPart = suburbBookingScore(suburb, aggregated.suburbCtaBooking);

  let score = Math.round(ctrPart + scrollPart + ctaPart);
  if (!gsc && scroll && scroll.sessions_at_25 < SCROLL_MIN_SESSIONS_BASELINE) {
    score = Math.min(score, 65);
  }

  const band = resolveHealthBand(score, {
    hasGsc: Boolean(gsc?.impressions),
    scrollSessions: scroll?.sessions_at_25 ?? 0,
    ctaSessions,
    ctrPart,
  });
  const titleCand = titleAutoCandidates.find((t) => t.slug === slug);

  return {
    slug,
    score,
    band,
    components: {
      ctr: Math.round(ctrPart * 10) / 10,
      scroll: Math.round(scrollPart * 10) / 10,
      cta: Math.round(ctaPart * 10) / 10,
    },
    data_gaps: buildPageHealthDataGaps(gsc, scroll, ctaSessions),
    winning_title_variant: titleCand?.variant ?? null,
    best_cta_key: slugBestCta.get(slug)?.key ?? null,
  };
}

export function runSeoOptimizationEngine(
  aggregated: AggregatedSeoEvents,
  options?: SeoOptimizationEngineOptions,
): SeoOptimizationEngineResult {
  const gscMetricsBySlug = options?.gscMetricsBySlug;
  const recommendations: SeoRecommendationInsert[] = [];
  const titleAutoCandidates: TitleAutoCandidate[] = [];
  const hubUiPatches = heroSwapFromAggregates(aggregated);

  const slugSet = new Set<string>(CAPE_TOWN_LOCATIONS.map((l) => l.slug));
  for (const f of aggregated.scrollFunnels) slugSet.add(f.slug);

  const scrollMap = new Map(aggregated.scrollFunnels.map((f) => [f.slug, f]));
  const suburbBySlug = new Map(CAPE_TOWN_LOCATIONS.map((l) => [l.slug, l.name] as const));

  const slugBestCta = new Map<string, { key: string; conversion_pct: number; sessions: number }>();
  for (const row of aggregated.slugCtaKindLocationBooking) {
    if (row.distinct_sessions < CTA_SLUG_MIN_SESSIONS) continue;
    const prev = slugBestCta.get(row.slug);
    if (!prev || row.conversion_pct > prev.conversion_pct) {
      slugBestCta.set(row.slug, {
        key: row.key,
        conversion_pct: row.conversion_pct,
        sessions: row.distinct_sessions,
      });
    }
  }

  const qualifiedGlobal = aggregated.ctaKindLocationBooking
    .filter((r) => r.distinct_sessions >= CTA_GLOBAL_MIN_SESSIONS)
    .sort((a, b) => b.conversion_pct - a.conversion_pct);

  if (qualifiedGlobal.length >= 2) {
    const best = qualifiedGlobal[0]!;
    const second = qualifiedGlobal[1]!;
    if (second.conversion_pct > 0) {
      const rel = (best.conversion_pct - second.conversion_pct) / second.conversion_pct;
      if (rel >= CTA_GLOBAL_MIN_REL_CONV_LIFT) {
        recommendations.push({
          slug: null,
          kind: "cta_global_promotion",
          severity: "info",
          title: `Promote ${best.cta_kind} CTAs in ${best.cta_location} surfaces`,
          detail: {
            winner: { key: best.key, conversion_pct: best.conversion_pct, sessions: best.distinct_sessions },
            runner_up: { key: second.key, conversion_pct: second.conversion_pct, sessions: second.distinct_sessions },
            relative_lift: Math.round(rel * 1000) / 1000,
          },
          confidence: Math.min(1, best.distinct_sessions / 200),
        });
      }
    }
  }

  for (const slug of slugSet) {
    const titleCand = pickVariantWinnerFromGsc(slug);
    if (titleCand) {
      titleAutoCandidates.push(titleCand);
      recommendations.push({
        slug,
        kind: "title_variant_promotion",
        severity: "warn",
        title: `Change title variant to ${titleCand.variant}`,
        detail: { variant: titleCand.variant, reason: titleCand.reason },
        confidence: titleCand.confidence,
      });
    }

    const funnel = scrollMap.get(slug);
    if (funnel && funnel.sessions_at_25 >= SCROLL_MIN_SESSIONS_BASELINE) {
      if (funnel.pct_to_50 < SCROLL_WEAK_HERO_PCT_50) {
        recommendations.push({
          slug,
          kind: "scroll_weak_hero",
          severity: "warn",
          title: "Improve hero clarity",
          detail: {
            pct_to_50: funnel.pct_to_50,
            sessions_at_25: funnel.sessions_at_25,
            threshold: SCROLL_WEAK_HERO_PCT_50,
          },
          confidence: Math.min(1, funnel.sessions_at_25 / 80),
        });
      }
      if (funnel.pct_to_75 < SCROLL_WEAK_MID_PCT_75) {
        recommendations.push({
          slug,
          kind: "scroll_weak_mid",
          severity: "critical",
          title: "Mid-page engagement issue — tighten pacing and CTAs",
          detail: {
            pct_to_75: funnel.pct_to_75,
            sessions_at_25: funnel.sessions_at_25,
            threshold: SCROLL_WEAK_MID_PCT_75,
          },
          confidence: Math.min(1, funnel.sessions_at_25 / 80),
        });
      }
    }

    const patch = hubUiPatches.find((p) => p.slug === slug);
    if (patch?.swap_hero_book_ctas) {
      recommendations.push({
        slug,
        kind: "cta_hero_order",
        severity: "info",
        title: "Move pricing-oriented hero CTA ahead and increase visual weight",
        detail: {
          swap_hero_book_ctas: true,
          reason: patch.reason,
        },
        confidence: patch.confidence,
      });
    }

    const health = computeSlugHealth(
      slug,
      aggregated,
      scrollMap,
      suburbBySlug,
      titleAutoCandidates,
      slugBestCta,
      gscMetricsBySlug,
    );
    const { score, band, components } = health;
    const ctrPart = components.ctr;
    const scrollPart = components.scroll;
    const ctaPart = components.cta;

    if (band === "insufficient_data") {
      recommendations.push({
        slug,
        kind: "data_gaps",
        severity: "info",
        title: "Need more on-site data before full health scoring",
        detail: {
          score,
          band,
          missing_signals: health.data_gaps.missing_signals,
          scroll_sessions_at_25: health.data_gaps.scroll_sessions_at_25,
          scroll_sessions_needed: health.data_gaps.scroll_sessions_needed,
          cta_sessions: health.data_gaps.cta_sessions,
          cta_sessions_needed: health.data_gaps.cta_sessions_needed,
        },
        confidence: 0.45,
      });
    }

    if (band !== "strong" && band !== "insufficient_data") {
      recommendations.push({
        slug,
        kind: "page_health",
        severity: band === "critical" ? "critical" : "warn",
        title: `Page health · ${band.replace(/_/g, " ")} (${score})`,
        detail: {
          score,
          band,
          ctr_component: ctrPart,
          scroll_component: scrollPart,
          cta_component: ctaPart,
        },
        confidence: Math.min(
          1,
          (scrollMap.get(slug)?.sessions_at_25 ?? 0) / 100 +
            (resolveGscMetrics(slug, gscMetricsBySlug)?.impressions ?? 0) / 1000,
        ),
      });
    } else if (band === "insufficient_data") {
      recommendations.push({
        slug,
        kind: "page_health",
        severity: "info",
        title: `Page health · gathering data (${score})`,
        detail: {
          score,
          band,
          ctr_component: ctrPart,
          scroll_component: scrollPart,
          cta_component: ctaPart,
        },
        confidence: 0.4,
      });
    }
    if (band === "critical") {
      recommendations.push({
        slug,
        kind: "trust_signals",
        severity: "warn",
        title: "Add stronger trust signals",
        detail: { score, band, hint: "Reviews band, guarantees, and credential cues above the fold." },
        confidence: 0.55,
      });
    }
  }

  const pageHealth: PageHealthRow[] = [...slugSet].map((slug) =>
    computeSlugHealth(slug, aggregated, scrollMap, suburbBySlug, titleAutoCandidates, slugBestCta, gscMetricsBySlug),
  );
  pageHealth.sort((a, b) => a.score - b.score);

  return { titleAutoCandidates, hubUiPatches, recommendations, pageHealth };
}
