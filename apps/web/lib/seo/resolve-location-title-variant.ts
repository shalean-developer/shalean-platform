import { cache } from "react";
import {
  getDefaultEnvTitleVariant,
  getExplicitEnvTitleVariant,
} from "@/lib/seo/location-seo-feedback";
import type { LocationTitleVariantId } from "@/lib/seo/location-title-variants";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function isVariantId(v: unknown): v is LocationTitleVariantId {
  return v === "A" || v === "B" || v === "C";
}

/**
 * Title template resolution: explicit `LOCATION_SEO_FEEDBACK_JSON.titleVariant[slug]`,
 * then optional DB winner (`seo_auto_title_variant`), then default env variant.
 * Does **not** apply manual `titles[slug]` — that happens in {@link mergeLocationMetaTitle}.
 */
export const resolveLocationTitleVariant = cache(async (slug: string): Promise<LocationTitleVariantId> => {
  const explicit = getExplicitEnvTitleVariant(slug);
  if (explicit) return explicit;

  const admin = getSupabaseAdmin();
  if (admin) {
    const { data } = await admin.from("seo_auto_title_variant").select("variant").eq("slug", slug).maybeSingle();
    if (data?.variant && isVariantId(data.variant)) return data.variant;
  }

  return getDefaultEnvTitleVariant();
});
