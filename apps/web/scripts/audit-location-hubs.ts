/**
 * Static audit: catalogue ↔ LOCATION_SEO_PAGES coverage, duplicate meta titles (variant A), intros.
 *
 * Usage (from apps/web):
 *   npx tsx scripts/audit-location-hubs.ts
 */

import { CAPE_TOWN_LOCATIONS } from "@/lib/seo/capeTownLocations";
import { LOCATION_SEO_PAGES } from "@/lib/seo/capeTownSeoPages";
import { buildLocationPageMetaTitleForVariant } from "@/lib/seo/location-title-variants";

function main() {
  const rows = CAPE_TOWN_LOCATIONS;
  const missingSeo: string[] = [];
  const duplicateTitles = new Map<string, string[]>();

  for (const row of rows) {
    if (!LOCATION_SEO_PAGES[row.slug as keyof typeof LOCATION_SEO_PAGES]) {
      missingSeo.push(row.slug);
    }
    const title = buildLocationPageMetaTitleForVariant(row, "A");
    const list = duplicateTitles.get(title) ?? [];
    list.push(row.slug);
    duplicateTitles.set(title, list);
  }

  const dupes = [...duplicateTitles.entries()].filter(([, slugs]) => slugs.length > 1);

  console.log(`Location hubs in JSON: ${rows.length}`);
  console.log(`LOCATION_SEO_PAGES blocks: ${Object.keys(LOCATION_SEO_PAGES).length}`);
  if (missingSeo.length) {
    console.error("Missing LOCATION_SEO_PAGES entries:", missingSeo.join(", "));
    process.exitCode = 1;
  } else {
    console.log("✓ Every catalogue slug has a LOCATION_SEO_PAGES block.");
  }

  if (dupes.length) {
    console.error("Duplicate variant-A meta titles (needs differentiation or use titleVariant B/C):");
    for (const [title, slugs] of dupes) {
      console.error(`  "${title}" ← ${slugs.join(", ")}`);
    }
    process.exitCode = 1;
  } else {
    console.log("✓ No duplicate variant-A titles across hubs.");
  }
}

main();
