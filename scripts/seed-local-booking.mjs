#!/usr/bin/env node
/**
 * Local-only booking fixtures for manual /book testing.
 *
 * Safety: this script refuses every hosted Supabase URL. It only runs against
 * localhost/127.0.0.1 and uses synthetic @example.com users and invalid test
 * phone numbers.
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const require = createRequire(resolve(root, "apps/web/package.json"));
const { createClient } = require("@supabase/supabase-js");

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

const fileEnv = loadEnvFile(resolve(root, "apps/web/.env.local"));
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || fileEnv.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY || "").trim();

let parsedUrl;
try {
  parsedUrl = new URL(supabaseUrl);
} catch {
  console.error("[seed-local-booking] SAFETY BLOCK: invalid local Supabase URL.");
  process.exit(1);
}

const localHosts = new Set(["127.0.0.1", "localhost"]);
if (!localHosts.has(parsedUrl.hostname) || parsedUrl.port !== "54321") {
  console.error(
    `[seed-local-booking] SAFETY BLOCK: refusing non-local Supabase target ${parsedUrl.origin}. ` +
      "Expected http://127.0.0.1:54321 or http://localhost:54321.",
  );
  process.exit(1);
}
if (!serviceRoleKey) {
  console.error("[seed-local-booking] Missing SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local.");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_PASSWORD = "ShaleanLocal!2026#Cleaner";
const cleaners = [
  {
    id: "fa100001-0001-4001-8001-000000000001",
    email: "local.cleaner.one@example.com",
    name: "Local Cleaner One",
    phone: "+27000000101",
    latitude: -33.9610,
    longitude: 18.5050,
  },
  {
    id: "fa100001-0002-4001-8001-000000000002",
    email: "local.cleaner.two@example.com",
    name: "Local Cleaner Two",
    phone: "+27000000102",
    latitude: -33.9740,
    longitude: 18.4820,
  },
  {
    id: "fa100001-0003-4001-8001-000000000003",
    email: "local.cleaner.three@example.com",
    name: "Local Cleaner Three",
    phone: "+27000000103",
    latitude: -33.9690,
    longitude: 18.4760,
  },
];

const teams = [
  {
    id: "fa900001-0001-4009-8009-000000000001",
    name: "Local Move Team Alpha",
    members: [
      "fa100001-0001-4001-8001-000000000001",
      "fa100001-0002-4001-8001-000000000002",
    ],
  },
  {
    id: "fa900001-0002-4009-8009-000000000002",
    name: "Local Move Team Bravo",
    members: [
      "fa100001-0002-4001-8001-000000000002",
      "fa100001-0003-4001-8001-000000000003",
    ],
  },
  {
    id: "fa900001-0003-4009-8009-000000000003",
    name: "Local Move Team Charlie",
    members: [
      "fa100001-0001-4001-8001-000000000001",
      "fa100001-0003-4001-8001-000000000003",
    ],
  },
];

async function ensureAuthUser(def) {
  const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw new Error(`List auth users: ${listError.message}`);
  const existing = listed.users.find((user) => user.email?.toLowerCase() === def.email.toLowerCase());
  if (existing) return existing.id;

  const { data, error } = await admin.auth.admin.createUser({
    email: def.email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: def.name, role: "cleaner", local_fixture: true },
  });
  if (error || !data.user?.id) throw new Error(`Create ${def.email}: ${error?.message ?? "no user returned"}`);
  return data.user.id;
}

async function main() {
  console.log(`[seed-local-booking] Target verified: ${parsedUrl.origin}`);

  const { data: locations, error: locationError } = await admin
    .from("locations")
    .select("id, slug")
    .in("slug", ["athlone", "claremont"]);
  if (locationError) throw new Error(`Load locations: ${locationError.message}`);

  const locationBySlug = new Map((locations ?? []).map((row) => [row.slug, row.id]));
  const athloneId = locationBySlug.get("athlone");
  const claremontId = locationBySlug.get("claremont");
  if (!athloneId || !claremontId) {
    throw new Error(
      "Athlone/Claremont locations are missing. Run generate-locations-seed.mjs and locations_seed.sql first.",
    );
  }

  for (const def of cleaners) {
    const authUserId = await ensureAuthUser(def);
    const { error: cleanerError } = await admin.from("cleaners").upsert(
      {
        id: def.id,
        auth_user_id: authUserId,
        full_name: def.name,
        email: def.email,
        phone: def.phone,
        status: "active",
        is_active: true,
        is_available: true,
        can_do_deep_cleaning: true,
        can_do_move_cleaning: true,
        availability_weekdays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        latitude: def.latitude,
        longitude: def.longitude,
        rating: 4.8,
        jobs_completed: 25,
        acceptance_rate: 1,
      },
      { onConflict: "id" },
    );
    if (cleanerError) throw new Error(`Upsert cleaner ${def.email}: ${cleanerError.message}`);

    await admin.from("cleaner_locations").delete().eq("cleaner_id", def.id);
    const { error: locInsertError } = await admin.from("cleaner_locations").insert([
      { cleaner_id: def.id, location_id: athloneId },
      { cleaner_id: def.id, location_id: claremontId },
    ]);
    if (locInsertError) throw new Error(`Assign locations ${def.email}: ${locInsertError.message}`);

    await admin.from("cleaner_availability").delete().eq("cleaner_id", def.id);
    const availability = [];
    for (let offset = 0; offset < 30; offset += 1) {
      const date = new Date();
      date.setDate(date.getDate() + offset);
      availability.push({
        cleaner_id: def.id,
        date: date.toISOString().slice(0, 10),
        start_time: "08:00",
        end_time: "18:00",
        is_available: true,
      });
    }
    const { error: availabilityError } = await admin.from("cleaner_availability").insert(availability);
    if (availabilityError) throw new Error(`Insert availability ${def.email}: ${availabilityError.message}`);
  }

  for (const team of teams) {
    const { error: teamError } = await admin.from("teams").upsert(
      {
        id: team.id,
        name: team.name,
        service_type: "move_cleaning",
        capacity_per_day: 1,
        is_active: true,
        lead_cleaner_id: team.members[0],
      },
      { onConflict: "id" },
    );
    if (teamError) throw new Error(`Upsert team ${team.name}: ${teamError.message}`);

    await admin.from("team_members").delete().eq("team_id", team.id);
    const { error: memberError } = await admin.from("team_members").insert(
      team.members.map((cleanerId) => ({
        team_id: team.id,
        cleaner_id: cleanerId,
        active_from: "2026-01-01T00:00:00Z",
        active_to: null,
      })),
    );
    if (memberError) throw new Error(`Seed roster ${team.name}: ${memberError.message}`);
  }

  console.log(
    `[seed-local-booking] OK: seeded ${cleaners.length} synthetic cleaners and ${teams.length} move-clean teams.`,
  );
  console.log("[seed-local-booking] No production/customer/payment data was copied.");
}

main().catch((error) => {
  console.error(`[seed-local-booking] ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
