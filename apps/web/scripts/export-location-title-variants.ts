/**
 * Emit JSON mapping each hub slug → preview titles A/B/C for GSC experiments & env merges.
 *
 * Usage (from apps/web):
 *   npx tsx scripts/export-location-title-variants.ts > tmp/location-title-variants.json
 */

import { CAPE_TOWN_LOCATIONS } from "@/lib/seo/capeTownLocations";
import { previewLocationTitleVariants } from "@/lib/seo/location-title-variants";

const out: Record<string, ReturnType<typeof previewLocationTitleVariants>> = {};
for (const row of CAPE_TOWN_LOCATIONS) {
  out[row.slug] = previewLocationTitleVariants(row);
}
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
