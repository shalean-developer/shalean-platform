import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getExplicitEnvTitleVariant,
  hasManualLocationMetaTitle,
} from "@/lib/seo/location-seo-feedback";
import type { HubUiAutoPatch, SeoOptimizationEngineResult, TitleAutoCandidate } from "@/lib/seo/optimization/engine";

export type PersistSeoOptimizationOptions = {
  applyTitleVariants: boolean;
  applyHubUiPatches: boolean;
};

export type PersistSeoOptimizationSummary = {
  titleVariantsUpserted: number;
  hubPatchesUpserted: number;
  recommendationsInserted: number;
};

export async function persistSeoOptimizationResults(
  admin: SupabaseClient,
  result: SeoOptimizationEngineResult,
  opts: PersistSeoOptimizationOptions,
): Promise<PersistSeoOptimizationSummary> {
  let titleVariantsUpserted = 0;
  let hubPatchesUpserted = 0;

  const filterTitle = (c: TitleAutoCandidate): boolean => {
    if (hasManualLocationMetaTitle(c.slug)) return false;
    if (getExplicitEnvTitleVariant(c.slug)) return false;
    return c.confidence >= 0.35;
  };

  const filterPatch = (p: HubUiAutoPatch): boolean => p.confidence >= 0.35;

  if (opts.applyTitleVariants) {
    const candidates = result.titleAutoCandidates.filter(filterTitle);
    for (const c of candidates) {
      const { error } = await admin.from("seo_auto_title_variant").upsert(
        {
          slug: c.slug,
          variant: c.variant,
          reason: c.reason,
          confidence: c.confidence,
          source: "optimizer",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "slug" },
      );
      if (error) {
        console.error("[seo-optimization] seo_auto_title_variant upsert failed", c.slug, error.message);
      } else {
        titleVariantsUpserted++;
      }
    }
  }

  if (opts.applyHubUiPatches) {
    const patches = result.hubUiPatches.filter(filterPatch);
    for (const p of patches) {
      const { error } = await admin.from("seo_auto_hub_ui_patch").upsert(
        {
          slug: p.slug,
          swap_hero_book_ctas: p.swap_hero_book_ctas,
          reason: p.reason,
          confidence: p.confidence,
          source: "optimizer",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "slug" },
      );
      if (error) {
        console.error("[seo-optimization] seo_auto_hub_ui_patch upsert failed", p.slug, error.message);
      } else {
        hubPatchesUpserted++;
      }
    }
  }

  let recommendationsInserted = 0;
  if (result.recommendations.length > 0) {
    const { error } = await admin.from("seo_insights_recommendations").insert(
      result.recommendations.map((r) => ({
        slug: r.slug,
        kind: r.kind,
        severity: r.severity,
        title: r.title,
        detail: r.detail,
        confidence: r.confidence,
      })),
    );
    if (error) {
      console.error("[seo-optimization] seo_insights_recommendations insert failed", error.message);
    } else {
      recommendationsInserted = result.recommendations.length;
    }
  }

  return { titleVariantsUpserted, hubPatchesUpserted, recommendationsInserted };
}
