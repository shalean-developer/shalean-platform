#!/usr/bin/env node
/**
 * FARAI-UAT-REM-01 — synthetic booking fixtures for isolated non-prod only.
 *
 * Seeds deterministic cleaners, cleaner_locations, teams, and one conflict booking
 * so Farai can exercise Standard / Deep / Move / Airbnb / Office availability.
 *
 * Usage:
 *   node scripts/env/seed-uat-booking-fixtures.mjs --env staging
 *   node scripts/env/seed-uat-booking-fixtures.mjs --env development
 *   node scripts/env/seed-uat-booking-fixtures.mjs --env staging --reset
 *
 * Requires docs/audits/environments/evidence/.secrets-local/{env}.keys.env
 * Never prints secret values. Never targets production.
 */
import { createRequire } from "node:module";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
const require = createRequire(resolve(root, "apps/web/package.json"));
const { createClient } = require("@supabase/supabase-js");

const REFS = {
  staging: "gbgnemlpyykyhpqqbgru",
  development: "mbvixuzfvzbooiurvxwz",
};
const PRODUCTION_REF = "tchayecuvzssixyxlvfu";
const MARKER = "FARAI-UAT-BOOK";

/** Fixed UUIDs — idempotent across re-runs. */
const CLEANERS = [
  {
    id: "a1111111-1111-4111-8111-111111111101",
    email: "uat-book-cleaner-01@shalean.test",
    name: "UAT Highly Rated Experienced",
    role: "highly_rated",
    rating: 4.95,
    jobs_completed: 180,
    review_count: 92,
    is_available: true,
    status: "available",
    can_do_deep_cleaning: true,
    can_do_move_cleaning: true,
    locations: ["sea-point", "claremont", "green-point"],
  },
  {
    id: "a1111111-1111-4111-8111-111111111102",
    email: "uat-book-cleaner-02@shalean.test",
    name: "UAT New Cleaner",
    role: "new",
    rating: 5,
    jobs_completed: 0,
    review_count: 0,
    is_available: true,
    status: "available",
    can_do_deep_cleaning: true,
    can_do_move_cleaning: true,
    locations: ["sea-point", "claremont"],
  },
  {
    id: "a1111111-1111-4111-8111-111111111103",
    email: "uat-book-cleaner-03@shalean.test",
    name: "UAT Average Cleaner",
    role: "average",
    rating: 3.8,
    jobs_completed: 24,
    review_count: 11,
    is_available: true,
    status: "available",
    can_do_deep_cleaning: true,
    can_do_move_cleaning: true,
    locations: ["sea-point", "claremont", "observatory"],
  },
  {
    id: "a1111111-1111-4111-8111-111111111104",
    email: "uat-book-cleaner-04@shalean.test",
    name: "UAT Unavailable Cleaner",
    role: "unavailable",
    rating: 4.2,
    jobs_completed: 40,
    review_count: 15,
    is_available: false,
    status: "offline",
    can_do_deep_cleaning: true,
    can_do_move_cleaning: true,
    locations: ["sea-point", "claremont"],
  },
  {
    id: "a1111111-1111-4111-8111-111111111105",
    email: "uat-book-cleaner-05@shalean.test",
    name: "UAT Outside Service Area",
    role: "outside_area",
    rating: 4.6,
    jobs_completed: 55,
    review_count: 20,
    is_available: true,
    status: "available",
    can_do_deep_cleaning: true,
    can_do_move_cleaning: true,
    locations: ["stellenbosch"],
  },
  {
    id: "a1111111-1111-4111-8111-111111111106",
    email: "uat-book-cleaner-06@shalean.test",
    name: "UAT No Deep Move Capability",
    role: "no_capability",
    rating: 4.4,
    jobs_completed: 33,
    review_count: 12,
    is_available: true,
    status: "available",
    can_do_deep_cleaning: false,
    can_do_move_cleaning: false,
    locations: ["sea-point", "claremont"],
  },
  {
    id: "a1111111-1111-4111-8111-111111111107",
    email: "uat-book-cleaner-07@shalean.test",
    name: "UAT Schedule Conflict Cleaner",
    role: "conflict",
    rating: 4.7,
    jobs_completed: 70,
    review_count: 28,
    is_available: true,
    status: "available",
    can_do_deep_cleaning: true,
    can_do_move_cleaning: true,
    locations: ["sea-point", "claremont"],
  },
  {
    id: "a1111111-1111-4111-8111-111111111108",
    email: "uat-book-cleaner-08@shalean.test",
    name: "UAT Eligible Fallback Cleaner",
    role: "fallback",
    rating: 4.85,
    jobs_completed: 95,
    review_count: 40,
    is_available: true,
    status: "available",
    can_do_deep_cleaning: true,
    can_do_move_cleaning: true,
    locations: ["sea-point", "claremont", "green-point", "camps-bay"],
  },
];

const TEAMS = [
  {
    id: "b1111111-1111-4111-8111-111111111201",
    name: "UAT Deep Team Alpha",
    service_type: "deep_cleaning",
    members: [
      "a1111111-1111-4111-8111-111111111101",
      "a1111111-1111-4111-8111-111111111102",
      "a1111111-1111-4111-8111-111111111108",
    ],
  },
  {
    id: "b1111111-1111-4111-8111-111111111202",
    name: "UAT Deep Team Bravo",
    service_type: "deep_cleaning",
    members: [
      "a1111111-1111-4111-8111-111111111103",
      "a1111111-1111-4111-8111-111111111107",
      "a1111111-1111-4111-8111-111111111108",
    ],
  },
  {
    id: "b1111111-1111-4111-8111-111111111203",
    name: "UAT Move Team Alpha",
    service_type: "move_cleaning",
    members: [
      "a1111111-1111-4111-8111-111111111101",
      "a1111111-1111-4111-8111-111111111103",
      "a1111111-1111-4111-8111-111111111108",
    ],
  },
  {
    id: "b1111111-1111-4111-8111-111111111204",
    name: "UAT Move Team Bravo",
    service_type: "move_cleaning",
    members: [
      "a1111111-1111-4111-8111-111111111102",
      "a1111111-1111-4111-8111-111111111107",
      "a1111111-1111-4111-8111-111111111108",
    ],
  },
];

const LOCATION_UPSERTS = [
  ["Sea Point", "sea-point", "Cape Town"],
  ["Claremont", "claremont", "Cape Town"],
  ["Green Point", "green-point", "Cape Town"],
  ["Observatory", "observatory", "Cape Town"],
  ["Camps Bay", "camps-bay", "Cape Town"],
  ["Stellenbosch", "stellenbosch", "Stellenbosch"],
  ["Gardens", "gardens", "Cape Town"],
  ["Devil's Peak Estate", "devils-peak-estate", "Cape Town"],
  ["Simon's Town", "simons-town", "Cape Town"],
  ["Durbanville", "durbanville", "Cape Town"],
];

function parseArgs(argv) {
  const env = argv.includes("--env") ? argv[argv.indexOf("--env") + 1] : null;
  const reset = argv.includes("--reset");
  if (!env || !REFS[env]) {
    console.error(
      "Usage: node scripts/env/seed-uat-booking-fixtures.mjs --env staging|development [--reset]",
    );
    process.exit(1);
  }
  return { env, reset };
}

function loadKeys(env) {
  const path = resolve(
    root,
    "docs/audits/environments/evidence/.secrets-local",
    `${env}.keys.env`,
  );
  if (!existsSync(path)) {
    throw new Error(`Missing keys file: ${path}`);
  }
  const map = {};
  for (const line of readFileSync(path, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    map[m[1]] = v;
  }
  const expectedRef = REFS[env];
  const url = `https://${expectedRef}.supabase.co`;
  const service = map.SUPABASE_SERVICE_ROLE_KEY;
  if (!service) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing in keys file");
  if (expectedRef === PRODUCTION_REF) {
    throw new Error("Refuses to run against production project ref");
  }
  return { url, service, expectedRef };
}

function assertNonProduction(adminUrl, expectedRef) {
  if (!adminUrl.includes(expectedRef)) {
    throw new Error(`URL does not match expected non-prod ref ${expectedRef}`);
  }
  if (adminUrl.includes(PRODUCTION_REF)) {
    throw new Error("Refuses to run against production Supabase URL");
  }
}

function conflictDateYmd() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 14);
  // Prefer a weekday
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

async function ensureLocations(admin) {
  for (const [name, slug, city] of LOCATION_UPSERTS) {
    const { error } = await admin.from("locations").upsert(
      { name, slug, city, province: "Western Cape" },
      { onConflict: "slug" },
    );
    if (error) throw new Error(`locations upsert ${slug}: ${error.message}`);
  }
  const { data, error } = await admin
    .from("locations")
    .select("id, slug")
    .in(
      "slug",
      LOCATION_UPSERTS.map(([, slug]) => slug),
    );
  if (error) throw new Error(`locations select: ${error.message}`);
  const map = new Map((data ?? []).map((r) => [r.slug, r.id]));
  for (const [, slug] of LOCATION_UPSERTS) {
    if (!map.has(slug)) throw new Error(`Missing location after upsert: ${slug}`);
  }
  return map;
}

async function ensureAuthAndCleaners(admin, env) {
  const secretsDir = resolve(root, "docs/audits/environments/evidence/.secrets-local");
  mkdirSync(secretsDir, { recursive: true });
  const passPath = resolve(secretsDir, `${env}.uat-booking-passwords.env`);
  const passwords = {};
  if (existsSync(passPath)) {
    for (const line of readFileSync(passPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([^=]+)=(.*)$/);
      if (m) passwords[m[1]] = m[2];
    }
  }

  for (const c of CLEANERS) {
    if (!passwords[c.email]) {
      passwords[c.email] = `Uat-${randomBytes(12).toString("base64url")}!`;
    }

    const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    let existing = listed?.users?.find((x) => x.email?.toLowerCase() === c.email.toLowerCase());
    if (!existing) {
      // Paginate a bit further if needed
      for (let page = 2; page <= 5 && !existing; page++) {
        const { data: more } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        existing = more?.users?.find((x) => x.email?.toLowerCase() === c.email.toLowerCase());
      }
    }

    let userId = existing?.id;
    if (!userId) {
      const { data, error } = await admin.auth.admin.createUser({
        id: c.id,
        email: c.email,
        password: passwords[c.email],
        email_confirm: true,
        user_metadata: {
          full_name: c.name,
          is_test: true,
          farai_uat: true,
          scenario: c.role,
        },
        app_metadata: { role: "cleaner", is_test: true, farai_uat: true },
      });
      if (error) {
        // ID conflict without email match — fall back to email-only create
        const retry = await admin.auth.admin.createUser({
          email: c.email,
          password: passwords[c.email],
          email_confirm: true,
          user_metadata: {
            full_name: c.name,
            is_test: true,
            farai_uat: true,
            scenario: c.role,
          },
          app_metadata: { role: "cleaner", is_test: true, farai_uat: true },
        });
        if (retry.error) throw new Error(`createUser ${c.email}: ${retry.error.message}`);
        userId = retry.data.user.id;
      } else {
        userId = data.user.id;
      }
    } else {
      await admin.auth.admin.updateUserById(userId, {
        app_metadata: { ...(existing.app_metadata || {}), role: "cleaner", is_test: true, farai_uat: true },
        user_metadata: {
          ...(existing.user_metadata || {}),
          full_name: c.name,
          is_test: true,
          farai_uat: true,
          scenario: c.role,
        },
      });
    }

    // Prefer fixed cleaner id when auth id matches; otherwise use auth user id.
    const cleanerId = userId === c.id ? c.id : userId;

    const phone = `+27000000${String(CLEANERS.indexOf(c) + 1).padStart(3, "0")}`;

    const { error: profileErr } = await admin.from("user_profiles").upsert(
      {
        id: userId,
        full_name: c.name,
        phone,
        role: "cleaner",
        finance_access: false,
        finance_manager_access: false,
        finance_owner_access: false,
      },
      { onConflict: "id" },
    );
    if (profileErr) throw new Error(`user_profiles ${c.email}: ${profileErr.message}`);

    const { error: cleanerErr } = await admin.from("cleaners").upsert(
      {
        id: cleanerId,
        full_name: c.name,
        email: c.email,
        phone,
        auth_user_id: userId,
        status: c.status,
        is_active: true,
        is_available: c.is_available,
        rating: c.rating,
        jobs_completed: c.jobs_completed,
        review_count: c.review_count,
        can_do_deep_cleaning: c.can_do_deep_cleaning,
        can_do_move_cleaning: c.can_do_move_cleaning,
        location: "UAT Sea Point",
      },
      { onConflict: "id" },
    );
    if (cleanerErr) throw new Error(`cleaners ${c.email}: ${cleanerErr.message}`);

    c._resolvedId = cleanerId;
  }

  writeFileSync(
    passPath,
    Object.entries(passwords)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n",
    "utf8",
  );

  return CLEANERS;
}

async function ensureCleanerLocations(admin, locationBySlug, cleaners) {
  for (const c of cleaners) {
    const cleanerId = c._resolvedId;
    for (const slug of c.locations) {
      const locationId = locationBySlug.get(slug);
      if (!locationId) throw new Error(`No location id for ${slug}`);
      const { error } = await admin.from("cleaner_locations").upsert(
        { cleaner_id: cleanerId, location_id: locationId },
        { onConflict: "cleaner_id,location_id" },
      );
      if (error) throw new Error(`cleaner_locations ${c.email}/${slug}: ${error.message}`);
    }
  }
}

async function ensureTeams(admin, cleaners) {
  const idByFixed = new Map(cleaners.map((c) => [c.id, c._resolvedId]));

  for (const team of TEAMS) {
    const lead = idByFixed.get(team.members[0]) ?? team.members[0];
    const { error } = await admin.from("teams").upsert(
      {
        id: team.id,
        name: team.name,
        service_type: team.service_type,
        capacity_per_day: 2,
        is_active: true,
        lead_cleaner_id: lead,
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(`teams ${team.name}: ${error.message}`);

    for (const memberFixed of team.members) {
      const cleanerId = idByFixed.get(memberFixed) ?? memberFixed;
      const { error: memErr } = await admin.from("team_members").upsert(
        {
          team_id: team.id,
          cleaner_id: cleanerId,
          active_from: "2026-01-01T00:00:00Z",
          active_to: null,
        },
        { onConflict: "team_id,cleaner_id" },
      );
      if (memErr) throw new Error(`team_members ${team.name}: ${memErr.message}`);
    }
  }
}

async function ensureConflictBooking(admin, cleaners, locationBySlug) {
  const conflictCleaner = cleaners.find((c) => c.role === "conflict");
  if (!conflictCleaner) return;
  const bookingDate = conflictDateYmd();
  const paystackRef = `${MARKER}-CONFLICT-${conflictCleaner._resolvedId.slice(0, 8)}`;
  const locationId = locationBySlug.get("claremont");

  const { error } = await admin.from("bookings").upsert(
    {
      paystack_reference: paystackRef,
      status: "confirmed",
      payment_status: "success",
      amount_paid_cents: 45000,
      payment_method: "card",
      payment_completed_at: new Date().toISOString(),
      service_slug: "standard-cleaning",
      customer_name: "UAT Conflict Fixture Customer",
      customer_email: "uat-book-conflict-customer@shalean.test",
      customer_phone: "+27000000099",
      is_test: true,
      total_price: 450,
      date: bookingDate,
      time: "09:00",
      cleaner_id: conflictCleaner._resolvedId,
      location_id: locationId,
      suburb: "Claremont",
      city: "Cape Town",
      price_snapshot: { farai_uat: true, marker: MARKER, kind: "conflict" },
      metadata: {
        farai_uat: true,
        marker: MARKER,
        kind: "conflict",
        scenario: "schedule_conflict",
      },
    },
    { onConflict: "paystack_reference" },
  );
  if (error) throw new Error(`conflict booking: ${error.message}`);
  console.log(`Conflict booking on ${bookingDate} → ${paystackRef}`);
}

async function resetFixtures(admin) {
  const emails = CLEANERS.map((c) => c.email);
  const { data: cleaners } = await admin.from("cleaners").select("id").in("email", emails);
  const cleanerIds = (cleaners ?? []).map((c) => c.id);

  await admin.from("bookings").delete().like("paystack_reference", `${MARKER}-%`);

  if (cleanerIds.length) {
    await admin.from("team_members").delete().in("cleaner_id", cleanerIds);
    await admin.from("cleaner_locations").delete().in("cleaner_id", cleanerIds);
  }
  await admin.from("teams").delete().in(
    "id",
    TEAMS.map((t) => t.id),
  );
  if (cleanerIds.length) {
    await admin.from("cleaners").delete().in("id", cleanerIds);
  }
  console.log("Reset: removed prior FARAI-UAT booking fixtures (auth users retained).");
}

async function main() {
  const { env, reset } = parseArgs(process.argv.slice(2));
  const { url, service, expectedRef } = loadKeys(env);
  assertNonProduction(url, expectedRef);

  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`FARAI-UAT booking fixtures → ${env} (${expectedRef})`);
  if (reset) await resetFixtures(admin);

  const locationBySlug = await ensureLocations(admin);
  const cleaners = await ensureAuthAndCleaners(admin, env);
  await ensureCleanerLocations(admin, locationBySlug, cleaners);
  await ensureTeams(admin, cleaners);
  await ensureConflictBooking(admin, cleaners, locationBySlug);

  console.log(
    JSON.stringify(
      {
        ok: true,
        env,
        ref: expectedRef,
        cleaners: cleaners.length,
        teams: TEAMS.length,
        locations: LOCATION_UPSERTS.length,
        production_untouched: true,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
