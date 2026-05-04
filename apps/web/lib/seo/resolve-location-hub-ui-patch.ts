import { cache } from "react";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type LocationHubUiPatch = {
  swapHeroBookCtas: boolean;
};

const defaultPatch: LocationHubUiPatch = { swapHeroBookCtas: false };

export const resolveLocationHubUiPatch = cache(async (slug: string): Promise<LocationHubUiPatch> => {
  const admin = getSupabaseAdmin();
  if (!admin) return defaultPatch;

  const { data } = await admin
    .from("seo_auto_hub_ui_patch")
    .select("swap_hero_book_ctas")
    .eq("slug", slug)
    .maybeSingle();

  if (!data || typeof data.swap_hero_book_ctas !== "boolean") return defaultPatch;
  return { swapHeroBookCtas: data.swap_hero_book_ctas };
});
