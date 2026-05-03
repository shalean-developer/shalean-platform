/**
 * One-off: clean user-provided location strings and diff vs supabase/seed/locations_seed.sql
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const seedPath = path.join(root, "supabase/seed/locations_seed.sql");

const raw = `
Cleaning Amandelrug
Cleaning Athlone
Cleaning Bantry Bay
Cleaning Belhar
Cleaning Bellville South
Cleaning Bergvliet
Cleaning Bishopscourt
Cleaning Bloubergrant
Cleaning Bloubergstrand
Cleaning Bo-Kaap
Cleaning Bothasig
Cleaning Brackenfell
Cleaning Brooklyn
Cleaning Camps Bay
Cleaning Cape Gate
Cleaning Cape Town
Cleaning Century City
Cleaning Chempet
Cleaning City Bowl
Cleaning Clareinch
Cleaning Claremont
Cleaning Clifton
Cleaning Clovelly
Cleaning Constantia
Cleaning Crawford
Cleaning D'urbanvale
Cleaning De Waterkant
Cleaning Devil's Peak Estate
Cleaning Diep River
Cleaning Durbanville
Cleaning Edgemead
Cleaning Epping
Cleaning Faure
Cleaning Firgrove
Cleaning Fish Hoek
Cleaning Foreshore
Cleaning Fresnaye
Cleaning Gardens
Cleaning Glencairn
Cleaning Glosderry
Cleaning Goodwood
Cleaning Green Point
Cleaning Groote Schuur
Cleaning Harfield Village
Cleaning Heathfield
Cleaning Helderberg
Cleaning Higgovale
Cleaning Hout Bay
Cleaning Howard Place
Cleaning Kalk Bay
Cleaning Kenilworth
Cleaning Kenwyn
Cleaning Kirstenhof
Cleaning Kommetjie
Cleaning Kraaifontein
Cleaning Kreupelbosch
Cleaning Kuils River
Cleaning Lansdowne
Cleaning Llandudno
Cleaning Lower Vrede
Cleaning Macassar
Cleaning Maitland
Cleaning Marconi Beam
Cleaning Meadowridge
Cleaning Milnerton
Cleaning Monte Vista
Cleaning Mouille Point
Cleaning Mowbray
Cleaning Mutual Park
Cleaning Newlands
Cleaning Noordhoek
Cleaning Observatory
Cleaning Old Oak
Cleaning Oranjezicht
Cleaning Ottery
Cleaning Paarden Island
Cleaning Panorama
Cleaning Parow
Cleaning Parow East
Cleaning Pinelands
Cleaning Plattekloof
Cleaning Plumstead
Cleaning Ravensmead
Cleaning Retreat
Cleaning Rhodes
Cleaning Rondebosch
Cleaning Rondebosch East
Cleaning Salt River
Cleaning Scarborough
Cleaning Schotse Kloof
Cleaning Sea Point
Cleaning Simon's Town
Cleaning Southfield
Cleaning St James
Cleaning Steenberg
Cleaning Sun Valley
Cleaning Sunnyside
Cleaning Sunset Beach
Cleaning Tableview
Cleaning Tamboerskloof
Cleaning Thornton
Cleaning Three Anchor Bay
Cleaning Tokai
Cleaning Tyger Valley
Cleaning Tygerberg
Cleaning University Estate
Cleaning Van Riebeeckshof
Cleaning Vredehoek
Cleaning Walmer Estate
Cleaning Waterfront
Cleaning Welgemoed
Cleaning West Beach
Cleaning Wetton
Cleaning Wittebome
Cleaning Woodstock
Cleaning Wynberg
Cleaning Ysterplaat
Cleaning Zonnebloem
`;

function slugify(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

const seed = fs.readFileSync(seedPath, "utf8");
const seedRows = [];
for (const m of seed.matchAll(/\(\s*'((?:''|[^'])*)'\s*,\s*'([^']+)'/g)) {
  const name = m[1].replace(/''/g, "'");
  const slug = m[2].replace(/''/g, "'");
  seedRows.push({ name, slug });
}
const seedByLower = new Map(seedRows.map((r) => [r.name.toLowerCase(), r]));
const seedSlugSet = new Set(seedRows.map((r) => r.slug.toLowerCase()));

/** Manual aliases: user label → canonical display name in DB (if known) */
const ALIAS_TO_CANON = {
  "waterfront": "V&A Waterfront",
  "d'urbanvale": "Durbanville",
  "durbanvale": "Durbanville",
  "tableview": "Tableview",
  "bloubergrant": "Bloubergstrand", // per user typo rule; note: seed also has Bloubergrant as separate area — user asked merge to Bloubergstrand
};

const EXCLUDED = new Map(); // canonical lower → reason
EXCLUDED.set("chempet", "Ambiguous typo (not inserted). Map manually to a real suburb if needed.");
EXCLUDED.set("glosderry", "Likely typo; no standard Cape Town suburb by this spelling (not inserted).");
EXCLUDED.set("rhodes", "Ambiguous (UCT/Rondebosch context); not a locations_seed name (not inserted).");

let lines = raw
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => l.replace(/^Cleaning\s+/i, "").trim())
  .filter(Boolean);

/** Apply alias / exclusions before dedupe */
const normalized = [];
for (let label of lines) {
  const low = label.toLowerCase().replace(/\s+/g, " ");
  const canonKey = low.replace(/[^a-z0-9']/g, "") === "durbanvale" ? "d'urbanvale" : low;
  const alias = ALIAS_TO_CANON[canonKey] ?? ALIAS_TO_CANON[low.replace(/'/g, "")] ?? ALIAS_TO_CANON[slugify(label)];
  if (alias) label = alias;
  const ex = EXCLUDED.get(label.toLowerCase());
  if (ex) {
    EXCLUDED.set(`_warn_${label}`, ex);
    continue;
  }
  normalized.push(label);
}

const deduped = [...new Set(normalized.map((s) => s.trim()))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

const missing = [];
const matched = [];
for (const name of deduped) {
  if (seedByLower.has(name.toLowerCase())) {
    matched.push(name);
    continue;
  }
  /** Try slug match to seed (e.g. Table View vs Tableview) */
  const sl = slugify(name);
  const bySlug = seedRows.find((r) => r.slug.toLowerCase() === sl);
  if (bySlug) {
    matched.push(`${name} → ${bySlug.name} (slug)`);
    continue;
  }
  missing.push(name);
}

const warnings = [
  "Chempet: excluded (ambiguous typo — map manually, e.g. Claremont if confirmed).",
  "Glosderry: excluded (non-standard spelling — verify intent before inserting).",
  "Rhodes: excluded (ambiguous vs UCT/Rondebosch — not inserted).",
  "Bloubergrant: normalized to Bloubergstrand per instructions (seed also has a separate Bloubergrant row).",
  "D'urbanvale: merged into Durbanville.",
  "Waterfront: merged into V&A Waterfront (canonical seed name).",
  "Groote Schuur: new row added alongside existing Groote Schuur Estate — consider consolidating later.",
  "Helderberg: new row added alongside existing Helderberg Estate — consider consolidating later.",
];

console.log(
  JSON.stringify(
    {
      countCleaned: deduped.length,
      matchedCount: matched.length,
      missing,
      cleanedSorted: deduped,
      warnings,
    },
    null,
    2,
  ),
);
