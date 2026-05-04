import { CAPE_TOWN_LOCATIONS } from "@/lib/seo/capeTownLocations";
import type { LocationGscMetricSnapshot } from "@/lib/seo/location-seo-feedback";
import {
  getExplicitEnvTitleVariant,
  getLocationGscMetrics,
  getLocationGscVariantMetrics,
  hasManualLocationMetaTitle,
} from "@/lib/seo/location-seo-feedback";
import type { LocationTitleVariantId } from "@/lib/seo/location-title-variants";
import type { AggregatedSeoEvents } from "@/lib/seo/optimization/aggregate-seo-events";

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

export type PageHealthBand = "strong" | "needs_improvement" | "critical";

export type PageHealthRow = {
  slug: string;
  score: number;
  band: PageHealthBand;
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

function gscCtrScore(metrics: LocationGscMetricSnapshot | null): number {
  if (!metrics || typeof metrics.ctr !== "number") return 0;
  return Math.min(40, (metrics.ctr / 0.12) * 40);
}

function scrollCompositeScore(pct50: number, pct75: number, pct100: number): number {
  const s =
    Math.min(1, pct50 / 100) * 10 + Math.min(1, pct75 / 100) * 10 + Math.min(1, pct100 / 100) * 15;
  return Math.min(35, s);
}

function suburbBookingScore(suburbName: string | undefined, suburbRollup: AggregatedSeoEvents["suburbCtaBooking"]): number {
  if (!suburbName) return 0;
  const row = suburbRollup.find((r) => r.suburb === suburbName);
  if (!row || row.sessions_with_cta < 10) return 0;
  return Math.min(25, row.conversion_pct * 2.5);
}

export function runSeoOptimizationEngine(aggregated: AggregatedSeoEvents): SeoOptimizationEngineResult {
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

    const gsc = getLocationGscMetrics(slug);
    const scroll = scrollMap.get(slug);
    const suburb = suburbBySlug.get(slug);
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

    const band = bandFromScore(score);
    if (band !== "strong") {
      recommendations.push({
        slug,
        kind: "page_health",
        severity: band === "critical" ? "critical" : "warn",
        title: `Page health · ${band.replace(/_/g, " ")} (${score})`,
        detail: {
          score,
          band,
          ctr_component: Math.round(ctrPart * 10) / 10,
          scroll_component: Math.round(scrollPart * 10) / 10,
          cta_component: Math.round(ctaPart * 10) / 10,
        },
        confidence: Math.min(
          1,
          (scroll?.sessions_at_25 ?? 0) / 100 + (gsc?.impressions ?? 0) / 1000,
        ),
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

  const pageHealth: PageHealthRow[] = [...slugSet].map((slug) => {
    const gsc = getLocationGscMetrics(slug);
    const scroll = scrollMap.get(slug);
    const suburb = suburbBySlug.get(slug);
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
    const titleCand = titleAutoCandidates.find((t) => t.slug === slug);
    return {
      slug,
      score,
      band: bandFromScore(score),
      winning_title_variant: titleCand?.variant ?? null,
      best_cta_key: slugBestCta.get(slug)?.key ?? null,
    };
  });
  pageHealth.sort((a, b) => a.score - b.score);

  return { titleAutoCandidates, hubUiPatches, recommendations, pageHealth };
}
