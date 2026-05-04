import type { HomeLocation } from "@/lib/home/data";
import { marketingHomeLocationHref } from "@/lib/marketing/homeLocationHref";

/** Deduped `/locations/...` links for hub pages — uses same hub resolution as the homepage areas section. */
export function buildHubCleaningServiceLinks(
  locations: readonly HomeLocation[],
  max = 24,
): { href: string; label: string }[] {
  const out: { href: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const loc of locations) {
    const href = marketingHomeLocationHref(loc);
    if (!href || seen.has(href)) continue;
    seen.add(href);
    out.push({ href, label: `${loc.name} cleaning services` });
  }
  return out.slice(0, max);
}
