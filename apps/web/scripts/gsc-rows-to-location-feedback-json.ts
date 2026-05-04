/**
 * Convert a JSON array of rows into a single-line LOCATION_SEO_FEEDBACK_JSON value.
 *
 * Input file example (`rows.json`):
 * [
 *   {
 *     "slug": "sea-point-cleaning-services",
 *     "meta_title": "…",
 *     "meta_description": "…",
 *     "title_variant": "B"
 *   }
 * ]
 *
 * Usage (from apps/web):
 *   npx tsx scripts/gsc-rows-to-location-feedback-json.ts ./tmp/gsc-location-rows.json
 */

import { readFileSync } from "node:fs";
import { rowsToLocationSeoFeedbackJson, type GscLocationMetaRow } from "../lib/seo/gsc-location-meta-merge";

const path = process.argv[2];
if (!path) {
  console.error("Usage: npx tsx scripts/gsc-rows-to-location-feedback-json.ts <rows.json>");
  process.exit(1);
}

const raw = readFileSync(path, "utf8");
const rows = JSON.parse(raw) as GscLocationMetaRow[];
if (!Array.isArray(rows)) {
  console.error("Input must be a JSON array.");
  process.exit(1);
}

process.stdout.write(rowsToLocationSeoFeedbackJson(rows));
