/**
 * Generates locations_seed.sql from raw area strings.
 * Run: node supabase/seed/generate-locations-seed.mjs
 */
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** May include prefixes like "House Cleaning Claremont" */
const RAW = [
  "House Cleaning Claremont",
  "House Cleaning Sea Point",
  "House Cleaning Constantia",
  "Amandelrug",
  "Athlone",
  "Bantry Bay",
  "Belhar",
  "Bellville",
  "Bellville South",
  "Bergvliet",
  "Bishopscourt",
  "Bloubergrant",
  "Bloubergstrand",
  "Bo-Kaap",
  "Bothasig",
  "Brackenfell",
  "Brooklyn",
  "Camps Bay",
  "Cape Gate",
  "Cape Town",
  "Century City",
  "Claremont",
  "Clifton",
  "Constantia",
  "Durbanville",
  "Fish Hoek",
  "Gardens",
  "Green Point",
  "Hout Bay",
  "Kenilworth",
  "Kuils River",
  "Milnerton",
  "Newlands",
  "Observatory",
  "Oranjezicht",
  "Paarl",
  "Parow",
  "Pinelands",
  "Plumstead",
  "Rondebosch",
  "Sea Point",
  "Stellenbosch",
  "Tableview",
  "Tokai",
  "V&A Waterfront",
  "Woodstock",
  "Wynberg",
  "Zonnebloem",
  "Airport Industria",
  "Amanda Glen",
  "Atlantis",
  "Avondale",
  "Banbury Estate",
  "Beacon Hill",
  "Bellville Park",
  "Big Bay",
  "Bishop Lavis",
  "Blackheath",
  "Blue Downs",
  "Bonnie Brook",
  "Boston",
  "Burgundy Estate",
  "Cape Town CBD",
  "Charlotteville",
  "Chatsworth",
  "Contermanskloof",
  "Croydon",
  "Daisy Park",
  "De Waterkant",
  "De Tijger",
  "Diep River",
  "Eerste River",
  "Elsies River",
  "Epping",
  "Epping Industria",
  "Eversdal",
  "Fairfield Estate",
  "Fisantekraal",
  "Foreshore",
  "Franschhoek",
  "Fresnaye",
  "Gatesville",
  "Glencairn",
  "Gordon's Bay",
  "Goodwood",
  "Grabouw",
  "Groote Schuur Estate",
  "Gugulethu",
  "Hanover Park",
  "Harfield Village",
  "Heathfield",
  "Helderberg Estate",
  "Hermanus",
  "Highlands Estate",
  "Imizamo Yethu",
  "Kalk Bay",
  "Khayelitsha",
  "Kirstenhof",
  "Kleinmond",
  "Kraaifontein",
  "Lakeside",
  "Langa",
  "Loevenstein",
  "Maitland",
  "Maitland Garden Village",
  "Manenberg",
  "Marconi Beam",
  "Matroosfontein",
  "Meadowridge",
  "Melkbosstrand",
  "Mitchells Plain",
  "Montague Gardens",
  "Monte Vista",
  "Mouille Point",
  "Muizenberg",
  "Ndabeni",
  "Newlands Forest",
  "Noordhoek",
  "Northpine",
  "Norwood",
  "Oakdale",
  "Oakglen",
  "Ottery",
  "Panorama",
  "Parow East",
  "Parow North",
  "Parklands",
  "Philippi",
  "Philippi East",
  "Plattekloof",
  "Protea Heights",
  "Protea Park",
  "Retreat",
  "Richwood",
  "Rondebosch East",
  "Rosendal",
  "Royal Ascot",
  "Rylands",
  "Salt River",
  "Sanddrift",
  "Scarborough",
  "Scottsville",
  "Seaforth",
  "Sherwood",
  "Silvertown",
  "Simon's Town",
  "Soneike",
  "Somerset West",
  "St James",
  "Stellenridge",
  "Strand",
  "Strandfontein",
  "Sunningdale",
  "Sunnydale",
  "Sunset Beach",
  "Table View",
  "Tamboerskloof",
  "Thornton",
  "Three Anchor Bay",
  "Tokai Forest",
  "Tyger Waterfront",
  "Valmary Park",
  "Van Riebeeckshof",
  "Vredehoek",
  "Vredekloof",
  "Vredekloof Heights",
  "Welgelegen",
  "Welgemoed",
  "Wellington",
  "West Beach",
  "Westridge",
  "Wetton",
  "Windermere",
  "Woodbridge Island",
  "Ysterplaat",
  "Zevenwacht",
];

function stripHouseCleaning(s) {
  return s.replace(/^\s*house\s+cleaning\s+/i, "").trim();
}

function toDisplayName(raw) {
  let s = stripHouseCleaning(raw);
  if (/^v\s*&\s*a\s*$/i.test(s) || /^v\s*&\s*a\s+waterfront$/i.test(s)) return "V&A Waterfront";
  const small = new Set(["de", "van", "of", "and", "the"]);
  const words = s.split(/\s+/).filter(Boolean);
  const titled = words.map((w, i) => {
    const lw = w.toLowerCase();
    if (lw === "bo-kaap") return "Bo-Kaap";
    if (/^simon's$/i.test(w)) return "Simon's";
    if (/^gordon's$/i.test(w)) return "Gordon's";
    if (i > 0 && small.has(lw)) return lw;
    if (/^[A-Z]{2,}$/.test(w)) return w.charAt(0) + w.slice(1).toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  });
  let out = titled.join(" ");
  out = out.replace(/Gordon's town/gi, "Gordon's Bay").replace(/Gordon's$/i, "Gordon's Bay");
  if (raw.toLowerCase().includes("gordon") && raw.toLowerCase().includes("bay"))
    out = "Gordon's Bay";
  out = out.replace(/\bCbd\b/g, "CBD");
  return out;
}

function toSlug(displayName) {
  let s = displayName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/\s*v\s*&\s*a\s*/gi, "va ");
  s = s.toLowerCase();
  s = s.replace(/'/g, "");
  s = s.replace(/[^a-z0-9]+/g, "-");
  s = s.replace(/^-+|-+$/g, "");
  if (s === "tableview" || s === "table-view") return "table-view";
  return s;
}

function cityForSlug(slug) {
  const cities = {
    paarl: "Paarl",
    stellenbosch: "Stellenbosch",
    wellington: "Wellington",
    franschhoek: "Franschhoek",
    hermanus: "Hermanus",
    grabouw: "Grabouw",
    kleinmond: "Kleinmond",
    "somerset-west": "Somerset West",
    strand: "Strand",
    "gordons-bay": "Gordon's Bay",
    atlantis: "Atlantis",
    george: "George",
  };
  return cities[slug] ?? "Cape Town";
}

function main() {
  const bySlug = new Map();

  for (const raw of RAW) {
    const name = toDisplayName(raw);
    let slug = toSlug(name);
    if (!slug) continue;

    if (slug === "tableview") slug = "table-view";

    if (!bySlug.has(slug)) {
      bySlug.set(slug, { name, slug });
    }
  }

  const rows = [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  const esc = (s) => "'" + String(s).replace(/'/g, "''") + "'";

  let out = `-- ============================================================================
-- Shalean — locations reference (Western Cape service areas)
-- ============================================================================
-- Prerequisites: public.locations exists (20260432+). For NOT NULL slug + RLS use 20260435 first.
--
-- Cleaning rules applied to source labels:
--   • Remove leading "House Cleaning" (case-insensitive)
--   • Trim; display names in title case (Bo-Kaap, Sea Point, V&A Waterfront, Gordon's Bay)
--   • Slugs: kebab-case, ASCII (va-waterfront, sea-point, gordons-bay)
--
-- Re-run safe: ON CONFLICT (slug) DO UPDATE syncs name/city/province.
-- Rows: ${rows.length}
-- ============================================================================

insert into public.locations (name, slug, city, province)
values
`;

  out += rows
    .map((r) => {
      const city = cityForSlug(r.slug);
      return `  (${esc(r.name)}, ${esc(r.slug)}, ${esc(city)}, ${esc("Western Cape")})`;
    })
    .join(",\n");

  out += `
on conflict (slug) do update set
  name = excluded.name,
  city = excluded.city,
  province = excluded.province;
`;

  const outPath = join(__dirname, "locations_seed.sql");
  writeFileSync(outPath, out, "utf8");
  console.error(`Wrote ${rows.length} locations -> ${outPath}`);
}

main();
