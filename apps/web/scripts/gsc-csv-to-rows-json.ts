/**
 * Convert a Search Console Performance → Pages CSV export into `tmp/gsc-rows.json`.
 *
 * Usage (from apps/web):
 *   npx tsx scripts/gsc-csv-to-rows-json.ts ./tmp/gsc-pages.csv -o ./tmp/gsc-rows.json
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mergeGscLocationMetaRows, parseGscPerformanceCsv } from "../lib/seo/gsc-page-import";
import type { GscLocationMetaRow } from "../lib/seo/gsc-location-meta-merge";

function usage(): never {
  console.error("Usage: npx tsx scripts/gsc-csv-to-rows-json.ts <pages.csv> [-o ./tmp/gsc-rows.json]");
  process.exit(1);
}

const args = process.argv.slice(2);
const csvPath = args.find((a) => !a.startsWith("-"));
const outIdx = args.findIndex((a) => a === "-o" || a === "--out");
const outPath = outIdx >= 0 ? args[outIdx + 1] : "./tmp/gsc-rows.json";

if (!csvPath) usage();
if (!existsSync(csvPath)) {
  console.error(`CSV not found: ${csvPath}`);
  process.exit(1);
}

const csvRows = parseGscPerformanceCsv(readFileSync(csvPath, "utf8"));
let existing: GscLocationMetaRow[] = [];
if (existsSync(outPath)) {
  try {
    const parsed = JSON.parse(readFileSync(outPath, "utf8")) as unknown;
    if (Array.isArray(parsed)) existing = parsed as GscLocationMetaRow[];
  } catch {
    existing = [];
  }
}

const rows = mergeGscLocationMetaRows(existing, csvRows);
writeFileSync(outPath, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
console.error(`Wrote ${outPath} (${rows.length} rows from CSV)`);
