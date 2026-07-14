#!/usr/bin/env node
/**
 * ENV-03 non-production seed: auth users + booking/isolation fixtures.
 *
 * Usage:
 *   node scripts/env/seed-nonprod.mjs --env staging
 *   node scripts/env/seed-nonprod.mjs --env development
 *   node scripts/env/seed-nonprod.mjs --env staging --reset
 *
 * Requires docs/audits/environments/evidence/.secrets-local/{staging,development}.keys.env
 * (gitignored). Never prints secret values.
 */
import { createRequire } from "node:module";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
const require = createRequire(resolve(root, "apps/web/package.json"));
const { createClient } = require("@supabase/supabase-js");

const REFS = {
  staging: "gbgnemlpyykyhpqqbgru",
  development: "mbvixuzfvzbooiurvxwz",
};

const USERS = {
  staging: [
    { email: "staging-admin@shalean.test", role: "admin", name: "TEST Staging Admin" },
    { email: "staging-customer@shalean.test", role: "customer", name: "TEST Staging Customer" },
    { email: "staging-cleaner@shalean.test", role: "cleaner", name: "TEST Staging Cleaner" },
  ],
  development: [
    { email: "development-admin@shalean.test", role: "admin", name: "TEST Development Admin" },
    { email: "development-customer@shalean.test", role: "customer", name: "TEST Development Customer" },
    { email: "development-cleaner@shalean.test", role: "cleaner", name: "TEST Development Cleaner" },
  ],
};

function parseArgs(argv) {
  const env = argv.includes("--env") ? argv[argv.indexOf("--env") + 1] : null;
  const reset = argv.includes("--reset");
  if (!env || !REFS[env]) {
    console.error("Usage: node scripts/env/seed-nonprod.mjs --env staging|development [--reset]");
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
  const url = `https://${REFS[env]}.supabase.co`;
  const service = map.SUPABASE_SERVICE_ROLE_KEY;
  if (!service) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing in keys file");
  return { url, service };
}

function marker(env) {
  const ts = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const prefix = env === "staging" ? "ENV-03-STG" : "ENV-03-DEV";
  return `${prefix}-${ts}`;
}

async function ensureUsers(admin, env) {
  const secretsDir = resolve(root, "docs/audits/environments/evidence/.secrets-local");
  mkdirSync(secretsDir, { recursive: true });
  const passPath = resolve(secretsDir, `${env}.synthetic-passwords.env`);
  const passwords = {};
  if (existsSync(passPath)) {
    for (const line of readFileSync(passPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([^=]+)=(.*)$/);
      if (m) passwords[m[1]] = m[2];
    }
  }

  const created = [];
  for (const u of USERS[env]) {
    if (!passwords[u.email]) {
      passwords[u.email] = `Test-${randomBytes(12).toString("base64url")}!`;
    }
    const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = listed?.users?.find((x) => x.email?.toLowerCase() === u.email.toLowerCase());
    let userId = existing?.id;
    if (!userId) {
      const { data, error } = await admin.auth.admin.createUser({
        email: u.email,
        password: passwords[u.email],
        email_confirm: true,
        user_metadata: { full_name: u.name, is_test: true, env03: true },
        app_metadata: { role: u.role, is_test: true },
      });
      if (error) throw new Error(`createUser ${u.email}: ${error.message}`);
      userId = data.user.id;
      created.push(u.email);
    } else {
      await admin.auth.admin.updateUserById(userId, {
        app_metadata: { ...(existing.app_metadata || {}), role: u.role, is_test: true },
        user_metadata: { ...(existing.user_metadata || {}), full_name: u.name, is_test: true },
      });
    }
    await admin.from("user_profiles").upsert(
      {
        id: userId,
        full_name: u.name,
        phone: "+27000000000",
        role: u.role,
        finance_access: u.role === "admin",
        finance_manager_access: u.role === "admin",
        finance_owner_access: false,
      },
      { onConflict: "id" },
    );
    if (u.role === "cleaner") {
      await admin.from("cleaners").upsert(
        {
          id: userId,
          full_name: u.name,
          email: u.email,
          phone: "+27000000000",
          auth_user_id: userId,
          status: "active",
          is_active: true,
          is_available: true,
        },
        { onConflict: "id" },
      );
    }
  }

  writeFileSync(
    passPath,
    Object.entries(passwords)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n",
    "utf8",
  );
  return { created, users: USERS[env] };
}

async function seedBookings(admin, env, isolationMarker) {
  const customerEmail =
    env === "staging" ? "staging-customer@shalean.test" : "development-customer@shalean.test";
  const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const customer = listed?.users?.find((x) => x.email === customerEmail);
  if (!customer) throw new Error("customer auth user missing");

  const fixtures = [
    {
      paystack_reference: `${isolationMarker}-pending`,
      status: "pending",
      payment_status: "pending",
      amount_paid_cents: 0,
      payment_method: "card",
      service_slug: "standard-cleaning",
      customer_name: `TEST ${env} Customer`,
      customer_email: customerEmail,
      customer_phone: "+27000000000",
      customer_id: customer.id,
      is_test: true,
      total_price: 450,
      price_snapshot: { env03: true, marker: isolationMarker, total: 450, kind: "pending" },
      metadata: { env03: true, marker: isolationMarker, kind: "pending" },
      suburb: "TEST Suburb",
      city: "Cape Town",
    },
    {
      paystack_reference: `${isolationMarker}-partial`,
      status: "pending",
      payment_status: "pending",
      amount_paid_cents: 20000,
      payment_method: "card",
      service_slug: "standard-cleaning",
      customer_name: `TEST ${env} Customer`,
      customer_email: customerEmail,
      customer_phone: "+27000000000",
      customer_id: customer.id,
      is_test: true,
      total_price: 450,
      price_snapshot: { env03: true, marker: isolationMarker, total: 450, kind: "partial" },
      metadata: { env03: true, marker: isolationMarker, kind: "partial" },
      suburb: "TEST Suburb",
      city: "Cape Town",
    },
    {
      paystack_reference: `${isolationMarker}-zerocash`,
      status: "pending",
      payment_status: "pending",
      amount_paid_cents: 0,
      payment_method: "eft",
      service_slug: "standard-cleaning",
      customer_name: `TEST ${env} Customer`,
      customer_email: customerEmail,
      customer_phone: "+27000000000",
      customer_id: customer.id,
      is_test: true,
      total_price: 0,
      price_snapshot: { env03: true, marker: isolationMarker, total: 0, kind: "zero_cash" },
      metadata: { env03: true, marker: isolationMarker, kind: "zero_cash" },
      suburb: "TEST Suburb",
      city: "Cape Town",
    },
  ];

  for (const row of fixtures) {
    const { error } = await admin.from("bookings").upsert(row, {
      onConflict: "paystack_reference",
    });
    if (error) {
      // fallback insert ignoring conflict uniqueness differences
      const ins = await admin.from("bookings").insert(row);
      if (ins.error) throw new Error(`booking ${row.paystack_reference}: ${ins.error.message}`);
    }
  }
  return fixtures.map((f) => f.paystack_reference);
}

function applyCatalogSql(env) {
  const prev = readFileSync(resolve(root, "supabase/.temp/project-ref"), "utf8").trim();
  try {
    execFileSync("npx", ["supabase", "link", "--project-ref", REFS[env], "--yes"], {
      cwd: root,
      stdio: "inherit",
      shell: true,
    });
    execFileSync(
      "npx",
      [
        "supabase",
        "db",
        "query",
        "--linked",
        "-f",
        "supabase/seeds/nonprod/env03_catalog_and_fixtures.sql",
      ],
      { cwd: root, stdio: "inherit", shell: true },
    );
  } finally {
    execFileSync("npx", ["supabase", "link", "--project-ref", prev || "tchayecuvzssixyxlvfu", "--yes"], {
      cwd: root,
      stdio: "inherit",
      shell: true,
    });
  }
}

async function resetFixtures(admin, env) {
  const prefix = env === "staging" ? "ENV-03-STG-%" : "ENV-03-DEV-%";
  const { error } = await admin.from("bookings").delete().like("paystack_reference", prefix);
  if (error) throw new Error(`reset bookings: ${error.message}`);
}

async function main() {
  const { env, reset } = parseArgs(process.argv.slice(2));
  if (REFS[env] === "tchayecuvzssixyxlvfu") {
    throw new Error("Refusing to seed production");
  }
  const { url, service } = loadKeys(env);
  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`[seed-nonprod] env=${env} ref=${REFS[env]}`);
  applyCatalogSql(env);

  if (reset) {
    await resetFixtures(admin, env);
    console.log("[seed-nonprod] reset ENV-03 booking fixtures");
  }

  const users = await ensureUsers(admin, env);
  const isolationMarker = marker(env);
  const refs = await seedBookings(admin, env, isolationMarker);

  const evidencePath = resolve(
    root,
    "docs/audits/environments/evidence",
    `env-03-seed-${env}-${isolationMarker}.json`,
  );
  writeFileSync(
    evidencePath,
    JSON.stringify(
      {
        env,
        ref: REFS[env],
        isolationMarker,
        bookingReferences: refs,
        authEmails: users.users.map((u) => u.email),
        createdAuth: users.created,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(`[seed-nonprod] isolationMarker=${isolationMarker}`);
  console.log(`[seed-nonprod] evidence=${evidencePath}`);
  console.log("[seed-nonprod] done (passwords in .secrets-local, not printed)");
}

main().catch((err) => {
  console.error("[seed-nonprod] FAILED:", err.message || err);
  process.exit(1);
});
