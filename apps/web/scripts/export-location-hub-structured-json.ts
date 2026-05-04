/**
 * Writes supabase/seed/blog_location_hubs_structured_content.json for DB updates.
 * Run from repo root: npx tsx apps/web/scripts/export-location-hub-structured-json.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LOCATION_HUB_STRUCTURED_PAGES } from "../lib/blog/seed/locationHubStructuredContent";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const out = path.join(root, "supabase", "seed", "blog_location_hubs_structured_content.json");

fs.writeFileSync(out, JSON.stringify({ pages: LOCATION_HUB_STRUCTURED_PAGES }, null, 2), "utf8");
process.stderr.write(`Wrote ${out}\n`);
