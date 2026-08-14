import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getExplicitEnvTitleVariant,
  hasManualLocationMetaTitle,
} from "@/lib/seo/location-seo-feedback";
import {
  isHubUiAutoApplyAllowed,
  isTitleAutoApplyAllowed,
  SEO_AUTO_APPLY_MAX_PER_TYPE,
} from "@/lib/seo/optimization/auto-apply-safety";
import type {
  SeoOptimizationEngineResult,
  SeoRecommendationInsert,
} from "@/lib/seo/optimization/engine";

export type PersistSeoOptimizationOptions = {
  applyTitleVariants: boolean;
  applyHubUiPatches: boolean;
  manualHubUiSlugs?: ReadonlySet<string>;
};

export type PersistSeoOptimizationSummary = {
  titleVariantsUpserted: number;
  hubPatchesUpserted: number;
  recommendationsInserted: number;
  titleCandidatesEligible: number;
  hubPatchesEligible: number;
  titleCandidatesCapped: number;
  hubPatchesCapped: number;
};

/**
 * Page-health scoring has three independent inputs: GSC CTR, scroll depth and CTA conversion.
 * A missing engagement baseline is not a measured zero. Keep those pages in "gathering data"
 * instead of persisting false critical/actionable issues until both engagement samples are ready.
 */
export function normalizeRecommendationsForDataReadiness(
  result: SeoOptimizationEngineResult,
): SeoRecommendationInsert[] {
  const healthBySlug = new Map(result.pageHealth.map((row) => [row.slug, row] as const));
  const normalized: SeoRecommendationInsert[] = [];
  const dataGapSlugs = new Set(
    result.recommendations
      .filter((recommendation) => recommendation.kind === "data_gaps" && recommendation.slug)
      .map((recommendation) => recommendation.slug as string),
  );

  for (const recommendation of result.recommendations) {
    const slug = recommendation.slug;
    const health = slug ? healthBySlug.get(slug) : undefined;
    const engagementReady = Boolean(health?.data_gaps.scroll_ready && health?.data_gaps.cta_ready);

    if (health && !engagementReady && recommendation.kind === "trust_signals") {
      // Trust work should be triggered by a measured critical page, not by missing traffic samples.
      continue;
    }

    if (health && !engagementReady && recommendation.kind === "page_health") {
      if (!dataGapSlugs.has(health.slug)) {
        normalized.push({
          slug: health.slug,
          kind: "data_gaps",
          severity: "info",
          title: "Need more on-site data before full health scoring",
          detail: {
            score: health.score,
            band: "insufficient_data",
            missing_signals: health.data_gaps.missing_signals,
            scroll_sessions_at_25: health.data_gaps.scroll_sessions_at_25,
            scroll_sessions_needed: health.data_gaps.scroll_sessions_needed,
            cta_sessions: health.data_gaps.cta_sessions,
            cta_sessions_needed: health.data_gaps.cta_sessions_needed,
          },
          confidence: 0.45,
        });
        dataGapSlugs.add(health.slug);
      }

      normalized.push({
        ...recommendation,
        severity: "info",
        title: `Page health · gathering data (${health.score})`,
        detail: {
          ...recommendation.detail,
          band: "insufficient_data",
          scroll_sessions_at_25: health.data_gaps.scroll_sessions_at_25,
          scroll_sessions_needed: health.data_gaps.scroll_sessions_needed,
          cta_sessions: health.data_gaps.cta_sessions,
          cta_sessions_needed: health.data_gaps.cta_sessions_needed,
        },
        confidence: Math.min(recommendation.confidence, 0.45),
      });
      continue;
    }

    normalized.push(recommendation);
  }

  return normalized;
}

export async function persistSeoOptimizationResults(
  admin: SupabaseClient,
  result: SeoOptimizationEngineResult,
  opts: PersistSeoOptimizationOptions,
): Promise<PersistSeoOptimizationSummary> {
  let titleVariantsUpserted = 0;
  let hubPatchesUpserted = 0;
  const manualHubUiSlugs = opts.manualHubUiSlugs ?? new Set<string>();

  const eligibleTitles = result.titleAutoCandidates.filter((candidate) =>
    isTitleAutoApplyAllowed({
      confidence: candidate.confidence,
      hasManualTitle: hasManualLocationMetaTitle(candidate.slug),
      hasExplicitEnvVariant: Boolean(getExplicitEnvTitleVariant(candidate.slug)),
    }),
  );
  const eligibleHubPatches = result.hubUiPatches.filter((patch) =>
    isHubUiAutoApplyAllowed({
      slug: patch.slug,
      confidence: patch.confidence,
      manualHubUiSlugs,
    }),
  );

  const titleCandidates = eligibleTitles.slice(0, SEO_AUTO_APPLY_MAX_PER_TYPE);
  const hubPatches = eligibleHubPatches.slice(0, SEO_AUTO_APPLY_MAX_PER_TYPE);

  if (opts.applyTitleVariants) {
    for (const candidate of titleCandidates) {
      const { error } = await admin.from("seo_auto_title_variant").upsert(
        {
          slug: candidate.slug,
          variant: candidate.variant,
          reason: candidate.reason,
          confidence: candidate.confidence,
          source: "optimizer",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "slug" },
      );
      if (error) {
        console.error("[seo-optimization] seo_auto_title_variant upsert failed", candidate.slug, error.message);
      } else {
        titleVariantsUpserted++;
      }
    }
  }

  if (opts.applyHubUiPatches) {
    for (const patch of hubPatches) {
      const { error } = await admin.from("seo_auto_hub_ui_patch").upsert(
        {
          slug: patch.slug,
          swap_hero_book_ctas: patch.swap_hero_book_ctas,
          reason: patch.reason,
          confidence: patch.confidence,
          source: "optimizer",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "slug" },
      );
      if (error) {
        console.error("[seo-optimization] seo_auto_hub_ui_patch upsert failed", patch.slug, error.message);
      } else {
        hubPatchesUpserted++;
      }
    }
  }

  const recommendations = normalizeRecommendationsForDataReadiness(result);
  let recommendationsInserted = 0;
  if (recommendations.length > 0) {
    const { error: deleteError } = await admin
      .from("seo_insights_recommendations")
      .delete()
      .is("applied_at", null);
    if (deleteError) {
      console.error("[seo-optimization] seo_insights_recommendations clear failed", deleteError.message);
    }

    const { error } = await admin.from("seo_insights_recommendations").insert(
      recommendations.map((recommendation) => ({
        slug: recommendation.slug,
        kind: recommendation.kind,
        severity: recommendation.severity,
        title: recommendation.title,
        detail: recommendation.detail,
        confidence: recommendation.confidence,
      })),
    );
    if (error) {
      console.error("[seo-optimization] seo_insights_recommendations insert failed", error.message);
    } else {
      recommendationsInserted = recommendations.length;
    }
  }

  return {
    titleVariantsUpserted,
    hubPatchesUpserted,
    recommendationsInserted,
    titleCandidatesEligible: eligibleTitles.length,
    hubPatchesEligible: eligibleHubPatches.length,
    titleCandidatesCapped: Math.max(eligibleTitles.length - titleCandidates.length, 0),
    hubPatchesCapped: Math.max(eligibleHubPatches.length - hubPatches.length, 0),
  };
}
