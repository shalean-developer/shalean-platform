#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const requireFromWeb = createRequire(path.join(repoRoot, "apps", "web", "package.json"));
const { createClient } = requireFromWeb("@supabase/supabase-js");

function parseDotEnv(content) {
  const out = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function decodeJwtPayload(token) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function splitTopLevel(input, delimiter = ",") {
  const parts = [];
  let current = "";
  let inString = false;
  let parenDepth = 0;
  let bracketDepth = 0;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];
    if (ch === "'" && inString && next === "'") {
      current += "''";
      i += 1;
      continue;
    }
    if (ch === "'") {
      inString = !inString;
      current += ch;
      continue;
    }
    if (!inString) {
      if (ch === "(") parenDepth += 1;
      if (ch === ")") parenDepth -= 1;
      if (ch === "[") bracketDepth += 1;
      if (ch === "]") bracketDepth -= 1;
      if (ch === delimiter && parenDepth === 0 && bracketDepth === 0) {
        parts.push(current.trim());
        current = "";
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseSqlString(token) {
  if (!token.startsWith("'") || !token.endsWith("'")) return token;
  return token.slice(1, -1).replaceAll("''", "'");
}

function parseValue(token) {
  const t = token.trim();
  if (/^null$/i.test(t)) return null;
  if (/^true$/i.test(t)) return true;
  if (/^false$/i.test(t)) return false;
  if (t.startsWith("ARRAY[")) return t;
  if (t.startsWith("'")) return parseSqlString(t);
  const n = Number(t);
  return Number.isFinite(n) ? n : t;
}

function parseInsert(sqlText) {
  const match = sqlText.match(
    /INSERT INTO\s+"public"\."cleaners"\s*\(([\s\S]*?)\)\s*VALUES\s*([\s\S]*?);/i,
  );
  if (!match) throw new Error("Could not find INSERT INTO public.cleaners statement.");
  const columnsRaw = match[1];
  const valuesRaw = match[2];
  const columns = splitTopLevel(columnsRaw).map((c) => c.replaceAll('"', "").trim());
  const tuples = [];
  let inString = false;
  let depth = 0;
  let start = -1;
  for (let i = 0; i < valuesRaw.length; i += 1) {
    const ch = valuesRaw[i];
    const next = valuesRaw[i + 1];
    if (ch === "'" && inString && next === "'") {
      i += 1;
      continue;
    }
    if (ch === "'") {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === "(") {
        if (depth === 0) start = i;
        depth += 1;
      } else if (ch === ")") {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          tuples.push(valuesRaw.slice(start + 1, i));
          start = -1;
        }
      }
    }
  }
  return tuples.map((tupleText) => {
    const vals = splitTopLevel(tupleText).map(parseValue);
    const row = {};
    columns.forEach((col, idx) => {
      row[col] = vals[idx] ?? null;
    });
    return row;
  });
}

function digitsOnly(v) {
  return String(v ?? "").replace(/\D/g, "");
}

/** Canonical SA mobile +27 + 9 digits (matches apps/web/lib/utils/phone.ts). */
function normalizeSouthAfricaPhone(input) {
  const trimmed = String(input).replace(/\s+/g, "").trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  let national9 = null;
  if (digits.startsWith("27") && digits.length >= 11) national9 = digits.slice(2, 11);
  else if (digits.startsWith("0") && digits.length >= 10) national9 = digits.slice(1, 10);
  else if (digits.length === 9) national9 = digits;
  if (!national9 || national9.length !== 9 || !/^\d{9}$/.test(national9)) return null;
  return `+27${national9}`;
}

function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

async function main() {
  const sqlPath =
    process.argv[2] ??
    path.join(process.env.USERPROFILE ?? "C:\\Users\\info", "Downloads", "cleaners_rows.sql");
  let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    try {
      const envLocalPath = path.join(repoRoot, "apps", "web", ".env.local");
      const envLocal = parseDotEnv(await fs.readFile(envLocalPath, "utf8"));
      supabaseUrl = supabaseUrl ?? envLocal.NEXT_PUBLIC_SUPABASE_URL ?? envLocal.SUPABASE_URL;
      serviceRoleKey = serviceRoleKey ?? envLocal.SUPABASE_SERVICE_ROLE_KEY;
    } catch {
      // ignore env file read errors
    }
  }
  const defaultPassword = process.env.DEFAULT_CLEANER_PASSWORD ?? "TempPass123!";
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.");
  }
  const jwtPayload = decodeJwtPayload(serviceRoleKey);
  const keyRole = jwtPayload?.role ?? "unknown";
  const keyRef = jwtPayload?.ref ?? "unknown";
  const urlRefMatch = String(supabaseUrl).match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i);
  const urlRef = urlRefMatch?.[1] ?? "unknown";
  if (keyRole !== "service_role") {
    throw new Error(`SUPABASE_SERVICE_ROLE_KEY is not service_role (detected role: ${keyRole}).`);
  }
  if (keyRef !== "unknown" && urlRef !== "unknown" && keyRef !== urlRef) {
    throw new Error(`Project mismatch: key ref ${keyRef} does not match URL ref ${urlRef}.`);
  }

  const sqlText = await fs.readFile(sqlPath, "utf8");
  const legacyRows = parseInsert(sqlText);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const cityRes = await supabase
    .from("cities")
    .select("id, slug, is_active, created_at")
    .order("created_at", { ascending: true });
  if (cityRes.error) throw new Error(`Failed to load cities: ${cityRes.error.message}`);
  const cityId =
    cityRes.data.find((c) => c.slug === "cape-town")?.id ??
    cityRes.data.find((c) => c.is_active)?.id ??
    null;

  const authUsers = [];
  for (let page = 1; page < 10; page += 1) {
    const listed = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (listed.error) {
      throw new Error(
        `Failed to list auth users: ${listed.error.message}. Check service-role key and project URL pairing.`,
      );
    }
    authUsers.push(...listed.data.users);
    if (!listed.data.users.length) break;
  }
  const authByPhoneDigits = new Map();
  for (const user of authUsers) {
    const digits = digitsOnly(user.phone || user.user_metadata?.phone || user.user_metadata?.phone_number);
    if (digits && !authByPhoneDigits.has(digits)) authByPhoneDigits.set(digits, user.id);
  }

  let createdAuth = 0;
  let reusedAuth = 0;
  let upserted = 0;
  let skipped = 0;
  const skippedRows = [];

  for (const row of legacyRows) {
    const fullName = String(row.name ?? "").trim();
    const phoneRaw = String(row.phone ?? "").trim();
    const phone = normalizeSouthAfricaPhone(phoneRaw);
    if (!fullName || !phone) {
      skipped += 1;
      skippedRows.push({
        reason: !fullName ? "missing full_name or phone" : "invalid South Africa phone",
        fullName,
        phone: phoneRaw,
      });
      continue;
    }
    const phoneDigits = digitsOnly(phone);
    const loginEmail =
      String(row.email ?? "").trim().toLowerCase() ||
      (phoneDigits ? `${phoneDigits}@cleaner.shalean.com` : `cleaner-${crypto.randomUUID()}@shalean.local`);

    let authId = authByPhoneDigits.get(phoneDigits) ?? null;
    if (!authId) {
      const created = await supabase.auth.admin.createUser({
        email: loginEmail,
        phone,
        password: defaultPassword,
        email_confirm: true,
        phone_confirm: true,
        user_metadata: { role: "cleaner", full_name: fullName, phone_number: phone },
      });
      if (created.error || !created.data.user?.id) {
        skipped += 1;
        skippedRows.push({
          reason: `createUser failed: ${created.error?.message ?? "unknown error"}`,
          fullName,
          phone,
        });
        continue;
      }
      authId = created.data.user.id;
      authByPhoneDigits.set(phoneDigits, authId);
      createdAuth += 1;
    } else {
      reusedAuth += 1;
    }

    const completionRaw = Number(row.completion_rate ?? 0);
    const acceptanceRate =
      completionRaw > 1 ? clamp(completionRaw / 100, 0, 1) : clamp(Number.isFinite(completionRaw) ? completionRaw : 0, 0, 1);
    const rating = clamp(Number(row.rating ?? 5) || 5, 0, 5);
    const lastLat = row.last_location_lat != null ? Number(row.last_location_lat) : null;
    const lastLng = row.last_location_lng != null ? Number(row.last_location_lng) : null;
    const baseLat = row.base_latitude != null ? Number(row.base_latitude) : null;
    const baseLng = row.base_longitude != null ? Number(row.base_longitude) : null;

    const payload = {
      auth_user_id: authId,
      full_name: fullName,
      phone,
      phone_number: phone,
      email: loginEmail,
      status: row.is_available ? "available" : "offline",
      rating,
      jobs_completed: 0,
      home_lat: Number.isFinite(lastLat) ? lastLat : Number.isFinite(baseLat) ? baseLat : null,
      home_lng: Number.isFinite(lastLng) ? lastLng : Number.isFinite(baseLng) ? baseLng : null,
      location: String(row.base_location ?? row.location ?? "").trim() || null,
      is_available: Boolean(row.is_available),
      availability_start: "08:00",
      availability_end: "17:00",
      city_id: cityId,
      acceptance_rate_recent: acceptanceRate,
      tier: "bronze",
      priority_score: 0,
    };

    const up = await supabase.from("cleaners").upsert(payload, { onConflict: "phone_number" });
    if (up.error) {
      skipped += 1;
      skippedRows.push({ reason: `cleaner upsert failed: ${up.error.message}`, fullName, phone });
      continue;
    }
    upserted += 1;
  }

  console.log("=== Cleaner Seed Summary ===");
  console.log(`Source rows: ${legacyRows.length}`);
  console.log(`Auth reused: ${reusedAuth}`);
  console.log(`Auth created: ${createdAuth}`);
  console.log(`Cleaners upserted: ${upserted}`);
  console.log(`Skipped: ${skipped}`);
  if (skippedRows.length) {
    console.log("\nSkipped rows:");
    for (const row of skippedRows) {
      console.log(`- ${row.fullName || "(no name)"} | ${row.phone || "(no phone)"} | ${row.reason}`);
    }
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

