/**
 * Convert a JSON array of rows into LOCATION_SEO_FEEDBACK_JSON.
 *
 * Usage (from apps/web):
 *   npx tsx scripts/gsc-rows-to-location-feedback-json.ts ./tmp/gsc-rows.json -o config/location-seo-feedback.json
 *   npx tsx scripts/gsc-rows-to-location-feedback-json.ts ./tmp/gsc-rows.json -o config/location-seo-feedback.json --catalog --merge
 *
 * Prefer `scripts/sync-gsc-location-feedback.ts` for CSV + catalog fills.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { rowsToLocationSeoFeedbackConfig } from "../lib/seo/gsc-location-meta-merge";
import type { GscLocationMetaRow } from "../lib/seo/gsc-location-meta-merge";
import {
  buildCatalogGscRows,
  mergeGscLocationMetaRows,
  mergeLocationSeoFeedbackConfig,
} from "../lib/seo/gsc-page-import";
import type { LocationSeoFeedbackConfig } from "../lib/seo/location-seo-feedback";

function usage(): never {
  console.error(
    "Usage: npx tsx scripts/gsc-rows-to-location-feedback-json.ts <rows.json> [-o config/location-seo-feedback.json] [--catalog] [--merge]",
  );
  console.error("Example: Copy-Item tmp/gsc-rows.example.json tmp/gsc-rows.json — then edit and run with -o.");
  process.exit(1);
}

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith("-"));
const outIdx = args.findIndex((a) => a === "-o" || a === "--out");
const outPath = outIdx >= 0 ? args[outIdx + 1] : undefined;
const useCatalog = args.includes("--catalog");
const mergeExisting = args.includes("--merge");

if (!path) usage();
if (outIdx >= 0 && !outPath) {
  console.error("Missing path after -o / --out");
  usage();
}

if (!existsSync(path)) {
  console.error(`File not found: ${path}`);
  console.error("Create it from the template:");
  console.error("  Copy-Item tmp/gsc-rows.example.json tmp/gsc-rows.json");
  console.error("Or run: npx tsx scripts/sync-gsc-location-feedback.ts --catalog");
  process.exit(1);
}

const raw = readFileSync(path, "utf8");
const parsed = JSON.parse(raw) as GscLocationMetaRow[];
if (!Array.isArray(parsed)) {
  console.error("Input must be a JSON array.");
  process.exit(1);
}

let rows = mergeGscLocationMetaRows(parsed);
if (useCatalog) rows = buildCatalogGscRows(rows);

const incoming = rowsToLocationSeoFeedbackConfig(rows);
let config: LocationSeoFeedbackConfig = incoming;

if (mergeExisting && outPath && existsSync(outPath)) {
  try {
    const existing = JSON.parse(readFileSync(outPath, "utf8")) as LocationSeoFeedbackConfig;
    config = mergeLocationSeoFeedbackConfig(existing, incoming);
  } catch {
    // keep incoming only
  }
}

if (outPath) {
  const pretty = `${JSON.stringify(config, null, 2)}\n`;
  writeFileSync(outPath, pretty, "utf8");
  console.error(`Wrote ${outPath} (${Object.keys(config.gscMetrics ?? {}).length} gscMetrics entries)`);
} else {
  process.stdout.write(JSON.stringify(config));
}
