/**
 * Sync Search Console metrics into `config/location-seo-feedback.json`.
 *
 * Usage (from apps/web):
 *   npx tsx scripts/sync-gsc-location-feedback.ts
 *   npx tsx scripts/sync-gsc-location-feedback.ts --csv ./tmp/gsc-pages.csv
 *   npx tsx scripts/sync-gsc-location-feedback.ts --rows ./tmp/gsc-rows.json --catalog
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { rowsToLocationSeoFeedbackConfig } from "../lib/seo/gsc-location-meta-merge";
import type { GscLocationMetaRow } from "../lib/seo/gsc-location-meta-merge";
import {
  buildCatalogGscRows,
  mergeGscLocationMetaRows,
  mergeLocationSeoFeedbackConfig,
  parseGscPerformanceCsv,
} from "../lib/seo/gsc-page-import";
import type { LocationSeoFeedbackConfig } from "../lib/seo/location-seo-feedback";

function usage(): never {
  console.error(
    "Usage: npx tsx scripts/sync-gsc-location-feedback.ts [--rows ./tmp/gsc-rows.json] [--csv ./tmp/gsc-pages.csv] [--catalog] [--merge] [-o config/location-seo-feedback.json]",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const rowsPath = args.includes("--rows") ? args[args.indexOf("--rows") + 1] : "./tmp/gsc-rows.json";
const csvPath = args.includes("--csv") ? args[args.indexOf("--csv") + 1] : undefined;
const useCatalog = args.includes("--catalog");
const mergeExisting = args.includes("--merge");
const outIdx = args.findIndex((a) => a === "-o" || a === "--out");
const outPath = outIdx >= 0 ? args[outIdx + 1] : "config/location-seo-feedback.json";

if (outIdx >= 0 && !outPath) usage();

function readJsonRows(path: string): GscLocationMetaRow[] {
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!Array.isArray(parsed)) {
    console.error(`${path} must be a JSON array.`);
    process.exit(1);
  }
  return parsed as GscLocationMetaRow[];
}

function readExistingConfig(path: string): LocationSeoFeedbackConfig {
  if (!mergeExisting || !existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as LocationSeoFeedbackConfig;
  } catch {
    return {};
  }
}

const csvRows = csvPath
  ? existsSync(csvPath)
    ? parseGscPerformanceCsv(readFileSync(csvPath, "utf8"))
    : (console.error(`CSV not found: ${csvPath}`), process.exit(1), [])
  : [];

const jsonRows = rowsPath ? readJsonRows(rowsPath) : [];
let mergedRows = mergeGscLocationMetaRows(jsonRows, csvRows);

if (useCatalog || mergedRows.length === 0) {
  mergedRows = buildCatalogGscRows(mergedRows);
}

const incoming = rowsToLocationSeoFeedbackConfig(mergedRows);
const existing = readExistingConfig(outPath);
const config = mergeExisting ? mergeLocationSeoFeedbackConfig(existing, incoming) : incoming;

const resolvedOut = join(process.cwd(), outPath);
writeFileSync(resolvedOut, `${JSON.stringify(config, null, 2)}\n`, "utf8");

if (rowsPath) {
  const resolvedRows = join(process.cwd(), rowsPath);
  writeFileSync(resolvedRows, `${JSON.stringify(mergedRows, null, 2)}\n`, "utf8");
  console.error(`Wrote ${rowsPath} (${mergedRows.length} rows)`);
}

const metricCount = Object.keys(config.gscMetrics ?? {}).length;
console.error(`Wrote ${outPath} (${metricCount} gscMetrics entries)`);
