import type { HomeLocation } from "@/lib/home/data";
import { locationSeoPathFromLegacyAreaSlug } from "@/lib/seo/capeTownSeoPages";

/** Resolve homepage location chip → `/locations/...` when a suburb hub exists. */
export function marketingHomeLocationHref(loc: HomeLocation): string | null {
  const raw = (loc.slug?.trim() || loc.name.trim().toLowerCase().replace(/\s+/g, "-")).toLowerCase();
  return locationSeoPathFromLegacyAreaSlug(raw);
}
