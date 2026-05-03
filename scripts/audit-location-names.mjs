import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const catPath = path.join(root, "apps/web/lib/booking/bookingFlowLocationCatalog.ts");
const seedPath = path.join(root, "supabase/seed/locations_seed.sql");

const cat = fs.readFileSync(catPath, "utf8");
const hints = [...cat.matchAll(/name:\s*"([^"]+)"/g)].map((m) => m[1]);
const extra = ["Belgravia", "Kenilworth"];
const fromCode = [...new Set([...hints, ...extra])].sort((a, b) => a.localeCompare(b));

const seed = fs.readFileSync(seedPath, "utf8");
/** First quoted string in each VALUES row: display name */
const seedNames = new Set();
for (const m of seed.matchAll(/\(\s*'((?:''|[^'])*)'\s*,\s*'/g)) {
  const n = m[1].replace(/''/g, "'");
  seedNames.add(n.toLowerCase());
}

const missing = fromCode.filter((n) => !seedNames.has(n.toLowerCase()));

console.log(JSON.stringify({ fromCodeCount: fromCode.length, missing, hasTableView: seedNames.has("table view") }, null, 2));
