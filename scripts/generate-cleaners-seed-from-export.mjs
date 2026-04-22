/**
 * One-off: read legacy cleaners_rows.sql export → emit public.cleaners INSERT for our schema.
 * Run: node scripts/generate-cleaners-seed-from-export.mjs [path/to/cleaners_rows.sql]
 *       (defaults to %USERPROFILE%/Downloads/cleaners_rows.sql on Windows)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const defaultSrc = path.join(process.env.USERPROFILE ?? "", "Downloads", "cleaners_rows.sql");
const src = process.argv[2] ? path.resolve(process.argv[2]) : defaultSrc;
const out = path.join(repoRoot, "supabase", "seed", "cleaners_seed.sql");

const s = fs.readFileSync(src, "utf8");

const colMatch = s.match(/INSERT INTO[^\(]+\(([^)]+)\)\s*VALUES\s*/is);
if (!colMatch) throw new Error("Could not parse INSERT header");
const cols = colMatch[1].split(",").map((c) => c.trim().replace(/^"+|"+$/g, ""));
const rest = s
  .slice(colMatch.index + colMatch[0].length)
  .replace(/;\s*$/, "")
  .trim();

/** Top-level (a,b),(c,d) split — skip commas inside strings and brackets. */
function splitTopTuples(str) {
  const rows = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "'") {
      i++;
      while (i < str.length) {
        if (str[i] === "'" && str[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (str[i] === "'") break;
        i++;
      }
      continue;
    }
    if (ch === "(") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === ")") {
      depth--;
      if (depth === 0 && start >= 0) {
        rows.push(str.slice(start + 1, i));
        start = -1;
      }
    }
  }
  return rows;
}

/** Split fields at commas not inside '' strings or [...] arrays. */
function parseFields(inner) {
  const fields = [];
  let cur = "";
  let depthSq = 0;
  let inStr = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inStr) {
      cur += ch;
      if (ch === "'" && inner[i + 1] === "'") {
        cur += inner[++i];
        continue;
      }
      if (ch === "'") inStr = false;
      continue;
    }
    if (ch === "'") {
      inStr = true;
      cur += ch;
      continue;
    }
    if (ch === "[") depthSq++;
    if (ch === "]") depthSq--;
    if (ch === "," && depthSq === 0) {
      fields.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) fields.push(cur.trim());
  return fields;
}

function sqlText(val) {
  if (val == null || val === "null") return "NULL";
  const inner = val.startsWith("'") && val.endsWith("'") ? val.slice(1, -1).replace(/''/g, "'") : String(val);
  if (inner.trim() === "") return "NULL";
  return "'" + inner.replace(/'/g, "''") + "'";
}

/** Matches apps/web/lib/cleaner/cleanerIdentity.ts (digits + @cleaner.shalean.com). */
function cleanerGeneratedLoginEmailSql(phoneField) {
  if (phoneField == null || phoneField === "null") return "'cleaner-unknown@cleaner.shalean.com'";
  const inner = phoneField.startsWith("'") && phoneField.endsWith("'") ? phoneField.slice(1, -1) : String(phoneField);
  let d = inner.replace(/\D/g, "");
  if (!d) return "'cleaner-unknown@cleaner.shalean.com'";
  if (d.startsWith("0")) d = `27${d.slice(1)}`;
  else if (!d.startsWith("27")) d = `27${d}`;
  return `'${d}@cleaner.shalean.com'`;
}

function sqlBool(val) {
  if (val === "true") return "true";
  if (val === "false") return "false";
  return "false";
}

function sqlNumOrNull(val) {
  if (val == null || val === "null") return "NULL";
  if (val.startsWith("'") && val.endsWith("'")) {
    const n = Number(val.slice(1, -1));
    if (!Number.isFinite(n)) return "NULL";
    return String(n);
  }
  const n = Number(val);
  if (!Number.isFinite(n)) return "NULL";
  return String(n);
}

function sqlRealRating(val) {
  const n = val?.startsWith("'") ? Number(val.slice(1, -1)) : Number(val);
  if (!Number.isFinite(n)) return "5";
  return String(Math.min(5, Math.max(0, n)));
}

function firstArea(areasField) {
  if (!areasField || areasField === "null") return null;
  const m = areasField.match(/^ARRAY\[(.*)\]$/is);
  if (!m) return null;
  const inner = m[1].trim();
  if (!inner) return null;
  // First quoted literal (handles '' inside strings)
  let i = 0;
  while (i < inner.length && /\s/.test(inner[i])) i++;
  if (inner[i] !== "'") return null;
  i++;
  let out = "";
  while (i < inner.length) {
    if (inner[i] === "'" && inner[i + 1] === "'") {
      out += "'";
      i += 2;
      continue;
    }
    if (inner[i] === "'") break;
    out += inner[i];
    i++;
  }
  return out || null;
}

function mapStatus(isActive, isAvailable) {
  const a = isActive === "true";
  const v = isAvailable === "true";
  if (!v) return "offline";
  if (a && v) return "available";
  return "busy";
}

const idx = (name) => cols.indexOf(name);
const tuples = splitTopTuples(rest);
const lines = [];

lines.push(`-- ============================================================================
-- Shalean — seed cleaners (imported from legacy export, mapped to public.cleaners)
-- ============================================================================
-- Source: cleaners_rows.sql (legacy app). Only columns that exist in this repo's
--         \`public.cleaners\` are populated. Omitted: photo_url, areas[], bio,
--         specialties[], password_hash, OTP flags, day booleans, payout fields, etc.
-- Prerequisites: full migrations through auth/cleaners shape (no password_hash;
--                  jobs_completed; surrogate id / optional auth_user_id).
-- ============================================================================

create extension if not exists pgcrypto;

-- Self-heal when run in SQL Editor on legacy / partial schemas (see migrations 20260464–20260465).
alter table public.cleaners add column if not exists phone_number text;
alter table public.cleaners add column if not exists jobs_completed integer default 0;
alter table public.cleaners add column if not exists home_lat double precision;
alter table public.cleaners add column if not exists home_lng double precision;
alter table public.cleaners add column if not exists latitude double precision;
alter table public.cleaners add column if not exists longitude double precision;
alter table public.cleaners add column if not exists location text;
alter table public.cleaners add column if not exists city_id uuid;
alter table public.cleaners add column if not exists location_id uuid;
alter table public.cleaners add column if not exists is_available boolean default true;
alter table public.cleaners add column if not exists availability_start time;
alter table public.cleaners add column if not exists availability_end time;
alter table public.cleaners add column if not exists auth_user_id uuid;
alter table public.cleaners add column if not exists acceptance_rate_recent real default 1.0;
alter table public.cleaners add column if not exists tier text default 'bronze';
alter table public.cleaners add column if not exists priority_score double precision default 0;

insert into public.cleaners (
  id,
  full_name,
  phone,
  phone_number,
  email,
  status,
  rating,
  jobs_completed,
  home_lat,
  home_lng,
  latitude,
  longitude,
  location,
  is_available,
  created_at,
  availability_start,
  availability_end,
  auth_user_id,
  acceptance_rate_recent,
  tier,
  priority_score
) values
`);

const valueLines = [];
for (const tuple of tuples) {
  const f = parseFields(tuple);
  if (f.length !== cols.length) {
    throw new Error(`Field count mismatch: got ${f.length}, expected ${cols.length} for row id ${f[0]}`);
  }
  const id = f[idx("id")];
  const name = f[idx("name")];
  const rating = f[idx("rating")];
  const phoneRaw = f[idx("phone")];
  const emailRaw = f[idx("email")];
  const isActive = f[idx("is_active")];
  const isAvailable = f[idx("is_available")];
  const createdAt = f[idx("created_at")];
  const lastLat = f[idx("last_location_lat")];
  const lastLng = f[idx("last_location_lng")];
  const baseLat = f[idx("base_latitude")];
  const baseLng = f[idx("base_longitude")];
  const areas = f[idx("areas")];
  const completionRate = f[idx("completion_rate")];

  const phoneSql = phoneRaw === "null" ? "NULL" : phoneRaw;
  let emailSql = sqlText(emailRaw);
  if (emailSql === "NULL") {
    emailSql = cleanerGeneratedLoginEmailSql(phoneSql === "NULL" ? null : phoneSql);
  }
  const nameSql = name === "null" ? "'Unknown'" : sqlText(name);

  const locLabel = firstArea(areas);
  const lat = baseLat !== "null" && baseLat != null ? baseLat : lastLat;
  const lng = baseLng !== "null" && baseLng != null ? baseLng : lastLng;

  let accRecent = "1";
  if (completionRate && completionRate !== "null") {
    const raw = completionRate.startsWith("'") ? completionRate.slice(1, -1) : completionRate;
    const pct = Number(raw);
    if (Number.isFinite(pct)) accRecent = String(Math.min(1, Math.max(0, pct > 1 ? pct / 100 : pct)));
  }

  const status = mapStatus(isActive, isAvailable);
  const locSql = locLabel ? "'" + locLabel.replace(/'/g, "''") + "'" : "NULL";

  const latSql = sqlNumOrNull(lat);
  const lngSql = sqlNumOrNull(lng);

  valueLines.push(
    `  (${id}::uuid, ${nameSql}, ${phoneSql}, ${phoneSql}, ${emailSql}, '${status}', ${sqlRealRating(rating)}::real, 0, ${latSql}::double precision, ${lngSql}::double precision, ${latSql}::double precision, ${lngSql}::double precision, ${locSql}, ${sqlBool(isAvailable)}, ${createdAt}::timestamptz, '08:00'::time, '17:00'::time, NULL, ${accRecent}::real, 'bronze', 0)`,
  );
}

lines.push(valueLines.join(",\n"));
lines.push(`
on conflict (id) do update set
  full_name = excluded.full_name,
  phone = excluded.phone,
  phone_number = excluded.phone_number,
  email = excluded.email,
  status = excluded.status,
  rating = excluded.rating,
  home_lat = excluded.home_lat,
  home_lng = excluded.home_lng,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  location = excluded.location,
  is_available = excluded.is_available,
  availability_start = excluded.availability_start,
  availability_end = excluded.availability_end,
  acceptance_rate_recent = excluded.acceptance_rate_recent,
  tier = excluded.tier,
  priority_score = excluded.priority_score;
`);

fs.writeFileSync(out, lines.join("\n"), "utf8");
console.log("Wrote", out, "rows:", tuples.length);
