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
import type { SeoOptimizationEngineResult } from "@/lib/seo/optimization/engine";

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

  let recommendationsInserted = 0;
  if (result.recommendations.length > 0) {
    const { error: deleteError } = await admin
      .from("seo_insights_recommendations")
      .delete()
      .is("applied_at", null);
    if (deleteError) {
      console.error("[seo-optimization] seo_insights_recommendations clear failed", deleteError.message);
    }

    const { error } = await admin.from("seo_insights_recommendations").insert(
      result.recommendations.map((recommendation) => ({
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
      recommendationsInserted = result.recommendations.length;
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
