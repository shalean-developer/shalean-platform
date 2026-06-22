/**
 * Quarterly GSC prep: static cannibalization risk report for location hubs vs intent landings.
 *
 * `npm run audit:gsc-cannibalization`
 *
 * Fails when duplicate `<title>` strings appear across indexable templates (fix in code).
 * Overlapping suburb/intent pairs are informational — review in Search Console Performance.
 */

import { CAPE_TOWN_LOCATIONS, resolveCapeTownHubRowFromAreaInput } from "@/lib/seo/capeTownLocations";
import { LOCATION_SEO_PAGES } from "@/lib/seo/capeTownSeoPages";
import { buildLocationPageMetaTitleForVariant } from "@/lib/seo/location-title-variants";
import {
  SEO_STAGE19_REGISTRY,
  stage19IntentLabel,
  type SeoStage19RegistryRow,
} from "@/lib/seo/seoPageRegistry";
import { SITE_ORIGIN } from "@/lib/site/canonical";

type TitledUrl = { url: string; title: string; kind: string };

function stage19Title(row: SeoStage19RegistryRow): string {
  const label = stage19IntentLabel(row.intentSegment);
  return `${label} ${row.suburbDisplayName} | Book Online | Shalean`;
}

function locationHubTitle(slug: string): string | null {
  const row = CAPE_TOWN_LOCATIONS.find((r) => r.slug === slug);
  if (!row) return null;
  return buildLocationPageMetaTitleForVariant(row, "A");
}

function main(): void {
  const titled: TitledUrl[] = [];

  for (const row of CAPE_TOWN_LOCATIONS) {
    const block = LOCATION_SEO_PAGES[row.slug as keyof typeof LOCATION_SEO_PAGES];
    if (!block) continue;
    titled.push({
      url: `${SITE_ORIGIN}${block.path}`,
      title: locationHubTitle(row.slug) ?? block.h1,
      kind: "location_hub",
    });
  }

  for (const row of SEO_STAGE19_REGISTRY) {
    titled.push({
      url: `${SITE_ORIGIN}${row.canonicalPath}`,
      title: stage19Title(row),
      kind: `stage19:${row.intentSegment}`,
    });
  }

  const byTitle = new Map<string, TitledUrl[]>();
  for (const entry of titled) {
    const list = byTitle.get(entry.title) ?? [];
    list.push(entry);
    byTitle.set(entry.title, list);
  }

  const duplicateTitles = [...byTitle.entries()].filter(([, urls]) => urls.length > 1);

  const overlapPairs: { suburb: string; locationHub: string; intentLanding: string; intent: string }[] = [];
  for (const row of SEO_STAGE19_REGISTRY) {
    const hubRow = resolveCapeTownHubRowFromAreaInput(row.suburbSlug);
    if (!hubRow) continue;
    const hubBlock = LOCATION_SEO_PAGES[hubRow.slug as keyof typeof LOCATION_SEO_PAGES];
    if (!hubBlock) continue;
    overlapPairs.push({
      suburb: row.suburbDisplayName,
      locationHub: hubBlock.path,
      intentLanding: row.canonicalPath,
      intent: row.intentSegment,
    });
  }

  console.log("[gsc-cannibalization-audit] Shalean programmatic SEO — GSC review pack\n");
  console.log(`Location hubs: ${titled.filter((t) => t.kind === "location_hub").length}`);
  console.log(`Stage-19 intent landings: ${SEO_STAGE19_REGISTRY.length}`);
  console.log(`Suburb overlap pairs (hub + intent): ${overlapPairs.length}\n`);

  console.log("── Search Console checklist (quarterly) ──");
  console.log("1. Performance → filter Page contains `/locations/` — note top queries & CTR.");
  console.log("2. Performance → filter Page contains `/deep-cleaning/` OR `/same-day-cleaning/` etc.");
  console.log("3. Pages → “Duplicate without user-selected canonical” / “Alternate page with proper canonical”.");
  console.log("4. Compare paired URLs below for the same suburb — ensure distinct queries or consolidate.");
  console.log("5. Export query+page CSV for overlaps; demote weak template or tighten internal links to the winner.\n");

  if (overlapPairs.length) {
    console.log("── Suburb overlap pairs (monitor in GSC) ──");
    for (const pair of overlapPairs) {
      console.log(
        `  ${pair.suburb}: ${pair.locationHub} ↔ ${pair.intentLanding} (${pair.intent.replace(/-/g, " ")})`,
      );
    }
    console.log("");
  }

  if (duplicateTitles.length) {
    console.error("── Duplicate <title> across templates (fix required) ──");
    for (const [title, urls] of duplicateTitles) {
      console.error(`  "${title}"`);
      for (const u of urls) {
        console.error(`    [${u.kind}] ${u.url}`);
      }
    }
    process.exitCode = 1;
  } else {
    console.log("✓ No duplicate meta titles across location hubs and stage-19 landings.");
  }
}

main();

export {};
