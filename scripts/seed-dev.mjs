#!/usr/bin/env node
/**
 * seed-dev.mjs — Idempotent development database seed.
 *
 * Creates safe, synthetic development fixtures for booking, cleaner allocation,
 * earnings, payout, invoice, and admin maker-checker testing.
 *
 * Safety controls:
 *   - Refuses to run if NEXT_PUBLIC_SUPABASE_URL contains the production ref.
 *   - Never reads, copies, or writes production personal/financial data.
 *   - All emails use @example.com domain; phones are reserved test numbers.
 *   - Idempotent: safe to run multiple times — no duplicate rows.
 *
 * Usage (from repo root):
 *   node scripts/seed-dev.mjs              # seed / re-seed
 *   node scripts/seed-dev.mjs --reset      # wipe seed rows then re-seed
 *   node scripts/seed-dev.mjs --dry-run    # print plan without writing
 *
 * Requires (from environment or apps/web/.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createRequire } from "node:module";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const require = createRequire(resolve(root, "apps/web/package.json"));
const { createClient } = require("@supabase/supabase-js");

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

const SEED_TAG = "DEVSEED";

/**
 * Multi-layer safety guard. Refuses to seed if:
 *   1. SHALEAN_APP_ENV is not "development" or "staging" (must be set explicitly).
 *   2. The resolved project ref matches SUPABASE_PROD_REF env var (if set).
 *   3. SEED_ALLOWED_PROJECT_REFS env var is set and the ref is not in that list.
 *
 * Project refs are never hardcoded in source — they are read from environment
 * variables or .env.local so that scanning tools see no credential-adjacent
 * identifiers in committed code.
 *
 * Required env vars (in apps/web/.env.local or shell):
 *   SHALEAN_APP_ENV=development          # or staging
 *   SUPABASE_PROD_REF=<prod-project-ref> # gitignored; blocks that specific ref
 *   SEED_ALLOWED_PROJECT_REFS=ref1,ref2  # optional explicit allow-list
 */
function assertNonProductionSeed(url, envVars) {
  const projectRef = url.match(/https:\/\/([^.]+)\.supabase/)?.[1] ?? "";

  if (!projectRef) {
    throw new Error("SAFETY BLOCK: cannot determine Supabase project ref from URL. Refusing to seed.");
  }

  // Layer 1 — SHALEAN_APP_ENV: process.env wins over file
  const appEnv = (process.env.SHALEAN_APP_ENV || envVars.SHALEAN_APP_ENV || "").trim().toLowerCase();
  if (!["development", "staging"].includes(appEnv)) {
    throw new Error(
      `SAFETY BLOCK: SHALEAN_APP_ENV must be "development" or "staging" to run the dev seed. ` +
      `Got: '${appEnv || "(unset)"}'. Set it in apps/web/.env.local.`,
    );
  }

  // Layer 2 — SUPABASE_PROD_REF: hard-block the explicitly declared production ref
  const prodRef = (process.env.SUPABASE_PROD_REF || envVars.SUPABASE_PROD_REF || "").trim();
  if (prodRef && projectRef === prodRef) {
    throw new Error(
      `SAFETY BLOCK: project ref matches SUPABASE_PROD_REF — refusing to seed production.`,
    );
  }

  // Layer 3 — SEED_ALLOWED_PROJECT_REFS: optional explicit allow-list
  const allowedEnv = (process.env.SEED_ALLOWED_PROJECT_REFS || envVars.SEED_ALLOWED_PROJECT_REFS || "").trim();
  if (allowedEnv) {
    const allowed = new Set(allowedEnv.split(",").map((r) => r.trim()).filter(Boolean));
    if (!allowed.has(projectRef)) {
      throw new Error(
        `SAFETY BLOCK: project ref '${projectRef}' is not in SEED_ALLOWED_PROJECT_REFS. ` +
        `Add it to that env var after confirming it is a non-production project.`,
      );
    }
  }

  return { projectRef, appEnv };
}

/** Fixed surrogate UUIDs for cleaner rows (cleaners.id, not auth_user_id). */
const CLEANER_IDS = {
  c1: "f1000001-0001-4001-8001-000000000001",
  c2: "f1000001-0002-4001-8001-000000000002",
  c3: "f1000001-0003-4001-8001-000000000003",
  c4: "f1000001-0004-4001-8001-000000000004",
  c5: "f1000001-0005-4001-8001-000000000005",
  c6: "f1000001-0006-4001-8001-000000000006",
};

/** Fixed UUIDs for bookings (paystack_reference is the conflict key but id is also fixed). */
const BOOKING_IDS = {
  completed_standard:     "f2000001-0001-4002-8002-000000000001",
  completed_deep:         "f2000001-0002-4002-8002-000000000002",
  completed_earnings_1:   "f2000001-0003-4002-8002-000000000003",
  completed_earnings_2:   "f2000001-0004-4002-8002-000000000004",
  upcoming_paid:          "f2000001-0005-4002-8002-000000000005",
  unpaid_awaiting:        "f2000001-0006-4002-8002-000000000006",
  failed_payment:         "f2000001-0007-4002-8002-000000000007",
  cancelled:              "f2000001-0008-4002-8002-000000000008",
  refunded:               "f2000001-0009-4002-8002-000000000009",
  move_completed:         "f2000001-0010-4002-8002-000000000010",
  office_scheduled:       "f2000001-0011-4002-8002-000000000011",
  carpet_completed:       "f2000001-0012-4002-8002-000000000012",
  multi_cleaner:          "f2000001-0013-4002-8002-000000000013",
  draft:                  "f2000001-0014-4002-8002-000000000014",
  monthly_billing_1:      "f2000001-0015-4002-8002-000000000015",
};

const EARNING_IDS = {
  e1: "f3000001-0001-4003-8003-000000000001",
  e2: "f3000001-0002-4003-8003-000000000002",
  e3: "f3000001-0003-4003-8003-000000000003",
  e4: "f3000001-0004-4003-8003-000000000004",
  e5: "f3000001-0005-4003-8003-000000000005",
};

const PAYOUT_RUN_IDS = {
  draft:    "f4000001-0001-4004-8004-000000000001",
  approved: "f4000001-0002-4004-8004-000000000002",
};

const PAYOUT_IDS = {
  p1_pending:  "f5000001-0001-4005-8005-000000000001",
  p2_frozen:   "f5000001-0002-4005-8005-000000000002",
  p3_approved: "f5000001-0003-4005-8005-000000000003",
  p4_paid:     "f5000001-0004-4005-8005-000000000004",
  p5_cancelled:"f5000001-0005-4005-8005-000000000005",
};

const RECURRING_IDS = {
  weekly:      "f6000001-0001-4006-8006-000000000001",
  fortnightly: "f6000001-0002-4006-8006-000000000002",
  monthly:     "f6000001-0003-4006-8006-000000000003",
};

const INVOICE_IDS = {
  draft:   "f7000001-0001-4007-8007-000000000001",
  sent:    "f7000001-0002-4007-8007-000000000002",
};

const PROPOSAL_IDS = {
  pending_by_admin1:  "f8000001-0001-4008-8008-000000000001",
  pending_by_admin2:  "f8000001-0002-4008-8008-000000000002",
  rejected:           "f8000001-0003-4008-8008-000000000003",
  approved:           "f8000001-0004-4008-8008-000000000004",
  expired:            "f8000001-0005-4008-8008-000000000005",
};

// ──────────────────────────────────────────────────────────────────────────────
// Synthetic user definitions (no real personal data)
// ──────────────────────────────────────────────────────────────────────────────

const ADMIN_USERS = [
  { email: "admin.one@example.com",     role: "admin", name: "Dev Admin One",     financeAccess: true,  financeManager: false, financeOwner: false },
  { email: "admin.two@example.com",     role: "admin", name: "Dev Admin Two",     financeAccess: true,  financeManager: false, financeOwner: false },
  { email: "finance.admin@example.com", role: "admin", name: "Dev Finance Admin", financeAccess: true,  financeManager: true,  financeOwner: true  },
];

const CLEANER_USERS = [
  { email: "cleaner.one@example.com",   role: "cleaner", name: "Dev Cleaner One",   cleanerId: CLEANER_IDS.c1 },
  { email: "cleaner.two@example.com",   role: "cleaner", name: "Dev Cleaner Two",   cleanerId: CLEANER_IDS.c2 },
  { email: "cleaner.three@example.com", role: "cleaner", name: "Dev Cleaner Three", cleanerId: CLEANER_IDS.c3 },
  { email: "cleaner.four@example.com",  role: "cleaner", name: "Dev Cleaner Four",  cleanerId: CLEANER_IDS.c4 },
  { email: "cleaner.five@example.com",  role: "cleaner", name: "Dev Cleaner Five",  cleanerId: CLEANER_IDS.c5 },
  { email: "cleaner.six@example.com",   role: "cleaner", name: "Dev Cleaner Six",   cleanerId: CLEANER_IDS.c6 },
];

const CUSTOMER_USERS = [
  { email: "customer.one@example.com",    role: "customer", name: "Dev Customer One"    },
  { email: "customer.two@example.com",    role: "customer", name: "Dev Customer Two"    },
  { email: "customer.three@example.com",  role: "customer", name: "Dev Customer Three"  },
  { email: "customer.four@example.com",   role: "customer", name: "Dev Customer Four"   },
  { email: "customer.five@example.com",   role: "customer", name: "Dev Customer Five"   },
  { email: "customer.six@example.com",    role: "customer", name: "Dev Customer Six"    },
  { email: "customer.seven@example.com",  role: "customer", name: "Dev Customer Seven"  },
  { email: "customer.eight@example.com",  role: "customer", name: "Dev Customer Eight"  },
];

// Synthetic phones in the +27 000 nxx range.
// +27 000 xxx xxxx is a deliberately invalid SA number: the "000" area prefix
// cannot be dialled on any SA or international network, making these unmistakably
// synthetic. They will never route to a real recipient via Twilio, Meta, or any
// other provider. (SA numbers are +27 followed by 9 digits; 000xxxxxx is
// structurally impossible — SA area codes start with non-zero.)
const TEST_PHONES = {
  admin:    "+27000000001",
  cleaner1: "+27000000011",
  cleaner2: "+27000000012",
  cleaner3: "+27000000013",
  cleaner4: "+27000000014",
  cleaner5: "+27000000015",
  cleaner6: "+27000000016",
  cust1:    "+27000000021",
  cust2:    "+27000000022",
  cust3:    "+27000000023",
  cust4:    "+27000000024",
  cust5:    "+27000000025",
  cust6:    "+27000000026",
  cust7:    "+27000000027",
  cust8:    "+27000000028",
};

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function isoDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

function isoDateStr(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function lastMonth() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Returns first day of last month as a Date (for payout period). */
function lastMonthStart() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

/** Returns last day of last month as a Date. */
function lastMonthEnd() {
  const d = new Date();
  d.setDate(0); // last day of previous month
  return d.toISOString().slice(0, 10);
}

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const map = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    map[m[1]] = v;
  }
  return map;
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase 1 — Cities & Locations
// ──────────────────────────────────────────────────────────────────────────────

async function seedCitiesAndLocations(admin) {
  // Cape Town city
  const { data: ctRows } = await admin
    .from("cities")
    .upsert({ name: "Cape Town", slug: "cape-town", is_active: true, country: "South Africa" }, { onConflict: "slug" })
    .select("id");
  const cityId = ctRows?.[0]?.id;
  if (!cityId) throw new Error("Failed to upsert Cape Town city");

  // Suburbs
  const suburbs = [
    { name: "Sea Point",   slug: "sea-point",   lat: -33.9166, lng: 18.3835 },
    { name: "Green Point", slug: "green-point", lat: -33.9099, lng: 18.4102 },
    { name: "Claremont",   slug: "claremont",   lat: -33.9808, lng: 18.4603 },
    { name: "Rondebosch",  slug: "rondebosch",  lat: -33.9688, lng: 18.4827 },
    { name: "Newlands",    slug: "newlands",    lat: -33.9747, lng: 18.4656 },
    { name: "Observatory", slug: "observatory", lat: -33.9427, lng: 18.4711 },
    { name: "Constantia",  slug: "constantia",  lat: -34.0202, lng: 18.4342 },
  ];

  const locationRows = suburbs.map((s) => ({
    name: s.name, slug: s.slug, city: "Cape Town", province: "Western Cape",
    latitude: s.lat, longitude: s.lng, city_id: cityId,
  }));

  // Upsert by slug (no ON CONFLICT support for non-unique cols via upsert, use REST)
  const locationIdMap = {};
  for (const row of locationRows) {
    // Try upsert by slug; if conflict key not available, select first
    const { data: existing } = await admin
      .from("locations")
      .select("id")
      .eq("slug", row.slug)
      .maybeSingle();

    if (existing?.id) {
      // Update coords / city_id if missing
      await admin.from("locations").update({ city_id: cityId, latitude: row.latitude, longitude: row.longitude }).eq("id", existing.id);
      locationIdMap[row.slug] = existing.id;
    } else {
      const { data: inserted, error } = await admin.from("locations").insert(row).select("id").single();
      if (error) throw new Error(`Insert location ${row.slug}: ${error.message}`);
      locationIdMap[row.slug] = inserted.id;
    }
  }

  return { cityId, locationIdMap };
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase 2 — Pricing Catalog (idempotent via ON CONFLICT)
// ──────────────────────────────────────────────────────────────────────────────

async function seedCatalog(admin) {
  // pricing_services
  const pricingServices = [
    { slug: "standard", name: "Regular Cleaning",  base_price: 350, price_per_bedroom: 80,  price_per_bathroom: 60, price_per_extra_room: 30, min_hours: 2, max_hours: 8,  duration_base: 3.5, duration_per_bedroom: 0.75, duration_per_bathroom: 0.5, duration_per_extra_room: 0.3, is_active: true, sort_order: 10 },
    { slug: "deep",     name: "Deep Cleaning",     base_price: 950, price_per_bedroom: 100, price_per_bathroom: 80, price_per_extra_room: 40, min_hours: 3, max_hours: 10, duration_base: 5.0, duration_per_bedroom: 1.0,  duration_per_bathroom: 0.75, duration_per_extra_room: 0.5, is_active: true, sort_order: 20 },
    { slug: "move",     name: "Moving Cleaning",  base_price:1100, price_per_bedroom: 120, price_per_bathroom: 90, price_per_extra_room: 45, min_hours: 4, max_hours: 12, duration_base: 6.0, duration_per_bedroom: 1.0,  duration_per_bathroom: 0.75, duration_per_extra_room: 0.5, is_active: true, sort_order: 30 },
    { slug: "office",   name: "Office Cleaning",  base_price: 450, price_per_bedroom: 60,  price_per_bathroom: 50, price_per_extra_room: 30, min_hours: 2, max_hours: 8,  duration_base: 3.5, duration_per_bedroom: 0.5,  duration_per_bathroom: 0.5, duration_per_extra_room: 0.3, is_active: true, sort_order: 40 },
    { slug: "carpet",   name: "Carpet Cleaning",  base_price: 500, price_per_bedroom: 120, price_per_bathroom: 0,  price_per_extra_room: 0,  min_hours: 2, max_hours: 8,  duration_base: 2.0, duration_per_bedroom: 0.75, duration_per_bathroom: 0.0, duration_per_extra_room: 0.0, is_active: true, sort_order: 50 },
    { slug: "airbnb",   name: "Airbnb Cleaning",  base_price: 400, price_per_bedroom: 80,  price_per_bathroom: 60, price_per_extra_room: 30, min_hours: 2, max_hours: 8,  duration_base: 3.0, duration_per_bedroom: 0.75, duration_per_bathroom: 0.5, duration_per_extra_room: 0.3, is_active: true, sort_order: 60 },
  ];

  for (const row of pricingServices) {
    await admin.from("pricing_services").upsert(row, { onConflict: "slug" });
  }

  // pricing_extras
  const extras = [
    { slug: "inside-fridge",      name: "Inside Fridge",      description: "Interior fridge clean",                        price: 150, service_type: "light", is_popular: true,  is_active: true, sort_order: 10 },
    { slug: "inside-oven",        name: "Inside Oven",        description: "Deep clean inside the oven",                   price: 200, service_type: "light", is_popular: true,  is_active: true, sort_order: 20 },
    { slug: "laundry",            name: "Laundry",            description: "Wash and hang up to 1 load",                   price: 150, service_type: "light", is_popular: false, is_active: true, sort_order: 30 },
    { slug: "ironing",            name: "Ironing",            description: "Ironing up to 1 load",                         price: 150, service_type: "light", is_popular: false, is_active: true, sort_order: 40 },
    { slug: "interior-windows",   name: "Interior Windows",   description: "Clean all interior windows",                   price: 180, service_type: "light", is_popular: false, is_active: true, sort_order: 50 },
    { slug: "inside-cabinets",    name: "Cupboards",          description: "Clean inside kitchen and bathroom cupboards",   price: 180, service_type: "light", is_popular: false, is_active: true, sort_order: 60 },
    { slug: "water-plants",       name: "Water Plants",       description: "Water indoor plants",                           price: 80,  service_type: "light", is_popular: false, is_active: true, sort_order: 70 },
    { slug: "interior-walls",     name: "Walls",              description: "Wipe down interior walls",                     price: 150, service_type: "light", is_popular: false, is_active: true, sort_order: 80 },
    { slug: "balcony-cleaning",   name: "Balcony",            description: "Sweep and clean balcony or patio",             price: 200, service_type: "heavy", is_popular: false, is_active: true, sort_order: 110 },
    { slug: "carpet-cleaning",    name: "Carpet clean",       description: "Steam clean carpeted rooms",                   price: 350, service_type: "heavy", is_popular: false, is_active: true, sort_order: 120 },
    { slug: "ceiling-cleaning",   name: "Ceilings",           description: "Dust and wipe ceilings",                       price: 300, service_type: "heavy", is_popular: false, is_active: true, sort_order: 130 },
    { slug: "garage-cleaning",    name: "Garage",             description: "Sweep and clean the garage",                   price: 200, service_type: "heavy", is_popular: false, is_active: true, sort_order: 140 },
    { slug: "mattress-cleaning",  name: "Mattress",           description: "Clean and sanitise one mattress",              price: 250, service_type: "heavy", is_popular: false, is_active: true, sort_order: 150 },
    { slug: "outside-windows",    name: "Outside Windows",    description: "Clean accessible exterior windows",            price: 250, service_type: "heavy", is_popular: false, is_active: true, sort_order: 160 },
    { slug: "inside-wardrobes",   name: "Wardrobes",          description: "Clean inside wardrobes and shelving",          price: 180, service_type: "heavy", is_popular: false, is_active: true, sort_order: 170 },
    { slug: "blinds-cleaning",    name: "Blinds",             description: "Dust and wipe blinds",                         price: 200, service_type: "heavy", is_popular: false, is_active: true, sort_order: 180 },
    { slug: "stain-treatment",    name: "Stain Treatment",    description: "Professional stain removal",                   price: 200, service_type: "heavy", is_popular: true,  is_active: true, sort_order: 210 },
    { slug: "pet-odour-treatment",name: "Pet Odour",          description: "Enzyme-based odour neutraliser",               price: 220, service_type: "heavy", is_popular: false, is_active: true, sort_order: 220 },
    { slug: "fabric-protector",   name: "Fabric Protector",   description: "Scotchgard-style protection spray",            price: 180, service_type: "heavy", is_popular: false, is_active: true, sort_order: 230 },
    { slug: "sofa-upholstery",    name: "Sofa / Upholstery",  description: "Clean one sofa or upholstered seat",           price: 250, service_type: "heavy", is_popular: false, is_active: true, sort_order: 240 },
    { slug: "welcome-setup",      name: "Welcome Setup",      description: "Arrange towels, toiletries, staging",          price: 150, service_type: "light", is_popular: false, is_active: true, sort_order: 310 },
    { slug: "inspection-photos",  name: "Post-clean Photos",  description: "Timestamped photos for your records",          price: 100, service_type: "light", is_popular: false, is_active: true, sort_order: 320 },
    { slug: "office-kitchen",     name: "Office Kitchen",     description: "Clean shared office kitchenette",              price: 200, service_type: "light", is_popular: false, is_active: true, sort_order: 410 },
    { slug: "office-sanitisation",name: "Sanitisation",       description: "High-touch sanitisation of desks and areas",   price: 250, service_type: "light", is_popular: false, is_active: true, sort_order: 420 },
    { slug: "deposit-preparation",name: "Deposit Prep",       description: "Extra detail for rental deposit inspection",   price: 250, service_type: "heavy", is_popular: false, is_active: true, sort_order: 510 },
    { slug: "appliances-cleaning",name: "Appliances",         description: "Clean major kitchen appliances inside and out",price: 220, service_type: "heavy", is_popular: false, is_active: true, sort_order: 520 },
  ];
  for (const row of extras) {
    await admin.from("pricing_extras").upsert(row, { onConflict: "slug" });
  }

  // pricing_booking_config
  const feesConfig = {
    serviceFeeRule: "flat", serviceFeeFlatCents: 3000, serviceFeePercent: 5,
    extraCleanerFeeZar: 299, suppliesEquipmentFeeZar: 0, suppliesEquipmentCostZar: 150,
    recurringDiscounts: {
      weekly:      { type: "percent", value: 10 },
      fortnightly: { type: "percent", value: 5 },
      monthly:     { type: "percent", value: 0 },
      custom:      { type: "percent", value: 0 },
    },
    propertyFactorRates: {
      propertyType:  { house: 0, apartment: 0, townhouse: 0 },
      officeSize:    { small: 0, medium: 50, large: 120, enterprise: 250 },
      lastCleaned:   { never: 100, "6_months_plus": 80, "3_6_months": 40, "1_3_months": 0 },
      furnished:     { yes: 50, no: 0 },
      carpetType:    { standard: 0, thick_pile: 50, berber: 30, persian_rug: 80 },
      stains:        { yes: 80, no: 0 },
      carpetRooms_per_room_zar: 150, rugs_per_unit_zar: 180, sofa_per_unit_zar: 250,
    },
  };
  await admin.from("pricing_booking_config").upsert(
    { id: "default", config: feesConfig },
    { onConflict: "id" },
  );

  // services (marketing)
  const marketingServices = [
    { id: "22222222-aaaa-4000-8000-000000000001", slug: "regular-cleaning", title: "Regular Cleaning", description: "Keep your home fresh and comfortable with a reliable weekly or once-off clean.", starting_price: 350, features: ["Bedrooms & bathrooms","Kitchen & living areas","Vacuuming & mopping"], sort_order: 10, is_active: true },
    { id: "22222222-aaaa-4000-8000-000000000002", slug: "deep-cleaning",    title: "Deep Cleaning",    description: "A thorough top-to-bottom clean of every surface, corner, and room.",              starting_price: 950, features: ["All regular areas","Walls, skirting, blinds","Oven & fridge interior"], sort_order: 20, is_active: true },
    { id: "22222222-aaaa-4000-8000-000000000003", slug: "moving-cleaning",  title: "Moving Cleaning",  description: "Move-in or move-out clean for a smooth handover and full deposit return.",          starting_price: 1100,features: ["Full property deep clean","Deposit-ready standard","Furnished or empty"],   sort_order: 30, is_active: true },
    { id: "22222222-aaaa-4000-8000-000000000004", slug: "office-cleaning",  title: "Office Cleaning",  description: "Professional cleaning for offices and workspaces.",                                 starting_price: 450, features: ["Desks & workstations","Kitchenette & bathrooms","Vacuuming & bins"],      sort_order: 40, is_active: true },
    { id: "22222222-aaaa-4000-8000-000000000005", slug: "carpet-cleaning",  title: "Carpet Cleaning",  description: "Steam and shampoo carpets, rugs and upholstery.",                                   starting_price: 500, features: ["Hot-water extraction","Stain pre-treatment","Rugs & upholstery"],         sort_order: 50, is_active: true },
    { id: "22222222-aaaa-4000-8000-000000000006", slug: "airbnb-cleaning",  title: "Airbnb Cleaning",  description: "Fast, reliable turnovers that keep your listing sparkling.",                         starting_price: 400, features: ["Linen changeover","Restocking & welcome setup","Photo-ready result"],    sort_order: 60, is_active: true },
  ];
  for (const row of marketingServices) {
    await admin.from("services").upsert(row, { onConflict: "id" });
  }

  return { pricingServicesCount: pricingServices.length, extrasCount: extras.length };
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase 3 — Auth users (idempotent via email lookup)
// ──────────────────────────────────────────────────────────────────────────────

async function ensureAuthUser(admin, { email, role, name, password }) {
  // List existing users to check if this email already exists
  // (paginate through to find the user)
  let page = 1;
  while (true) {
    const { data: listed } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (!listed?.users?.length) break;
    const existing = listed.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (existing) {
      // Update metadata but preserve existing ID
      await admin.auth.admin.updateUserById(existing.id, {
        app_metadata: { ...(existing.app_metadata ?? {}), role, is_test: true, devseed: true },
        user_metadata: { ...(existing.user_metadata ?? {}), full_name: name, is_test: true },
      });
      return existing.id;
    }
    if (listed.users.length < 200) break;
    page++;
  }
  // Create new user
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: password || `Dev-${randomBytes(10).toString("base64url")}!`,
    email_confirm: true,
    user_metadata: { full_name: name, is_test: true, devseed: true },
    app_metadata: { role, is_test: true, devseed: true },
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  return data.user.id;
}

async function seedAuthUsers(admin) {
  const userIdMap = {}; // email → authUserId

  for (const u of ADMIN_USERS) {
    const id = await ensureAuthUser(admin, { ...u, password: `Dev-Admin-Seed-${randomBytes(8).toString("hex")}!` });
    userIdMap[u.email] = id;
    await admin.from("user_profiles").upsert({
      id,
      full_name: u.name,
      phone: TEST_PHONES.admin,
      role: u.role,
      finance_access: u.financeAccess,
      finance_manager_access: u.financeManager,
      finance_owner_access: u.financeOwner,
    }, { onConflict: "id" });
  }

  for (const u of CLEANER_USERS) {
    const id = await ensureAuthUser(admin, { ...u, password: `Dev-Cleaner-Seed-${randomBytes(8).toString("hex")}!` });
    userIdMap[u.email] = id;
    await admin.from("user_profiles").upsert({
      id, full_name: u.name,
      phone: TEST_PHONES[`cleaner${CLEANER_USERS.indexOf(u) + 1}`],
      role: "cleaner",
    }, { onConflict: "id" });
  }

  const custPhones = ["cust1","cust2","cust3","cust4","cust5","cust6","cust7","cust8"];
  for (const [i, u] of CUSTOMER_USERS.entries()) {
    const id = await ensureAuthUser(admin, { ...u, password: `Dev-Customer-Seed-${randomBytes(8).toString("hex")}!` });
    userIdMap[u.email] = id;
    const isMonthlyBilling = u.email === "customer.three@example.com";
    await admin.from("user_profiles").upsert({
      id, full_name: u.name,
      phone: TEST_PHONES[custPhones[i]],
      role: "customer",
      tier: i === 0 ? "gold" : "regular",
      billing_type: isMonthlyBilling ? "monthly" : "per_booking",
      billing_email: u.email,
    }, { onConflict: "id" });
  }

  return userIdMap;
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase 4 — Cleaners
// ──────────────────────────────────────────────────────────────────────────────

async function seedCleaners(admin, userIdMap, locationIdMap) {
  const cleanerDefs = [
    {
      ...CLEANER_USERS[0],
      id: CLEANER_IDS.c1, status: "active", is_active: true, is_available: true,
      can_do_deep_cleaning: true, can_do_move_cleaning: true, tier: "gold",
      joined_at: new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString(),
      latitude: -33.9166, longitude: 18.3835,
      locations: ["sea-point", "green-point"],
      weekdays: ["mon","tue","wed","thu","fri","sat"],
    },
    {
      ...CLEANER_USERS[1],
      id: CLEANER_IDS.c2, status: "active", is_active: true, is_available: true,
      can_do_deep_cleaning: false, can_do_move_cleaning: false, tier: "silver",
      joined_at: new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString(),
      latitude: -33.9808, longitude: 18.4603,
      locations: ["claremont", "rondebosch"],
      weekdays: ["mon","tue","wed","thu","fri"],
    },
    {
      ...CLEANER_USERS[2],
      id: CLEANER_IDS.c3, status: "active", is_active: true, is_available: true,
      can_do_deep_cleaning: true, can_do_move_cleaning: true, tier: "bronze",
      joined_at: new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString(),
      latitude: -33.9099, longitude: 18.4102,
      locations: ["green-point", "sea-point"],
      weekdays: ["mon","tue","wed","thu","fri","sat","sun"],
    },
    {
      ...CLEANER_USERS[3],
      id: CLEANER_IDS.c4, status: "offline", is_active: false, is_available: false,
      can_do_deep_cleaning: true, can_do_move_cleaning: false, tier: "bronze",
      joined_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
      latitude: -33.9747, longitude: 18.4656,
      locations: ["newlands", "constantia"],
      weekdays: ["mon","wed","fri"],
    },
    {
      ...CLEANER_USERS[4],
      id: CLEANER_IDS.c5, status: "active", is_active: true, is_available: true,
      can_do_deep_cleaning: true, can_do_move_cleaning: true, tier: "silver",
      joined_at: new Date(Date.now() - 240 * 24 * 3600 * 1000).toISOString(),
      latitude: -33.9427, longitude: 18.4711,
      locations: ["observatory", "rondebosch"],
      weekdays: ["mon","tue","wed","thu","fri"],
    },
    {
      ...CLEANER_USERS[5],
      id: CLEANER_IDS.c6, status: "active", is_active: true, is_available: true,
      can_do_deep_cleaning: false, can_do_move_cleaning: false, tier: "bronze",
      joined_at: null, // Incomplete profile — no joined_at
      latitude: -33.9808, longitude: 18.4603,
      locations: ["claremont"],
      weekdays: ["tue","thu","sat"],
    },
  ];

  for (const def of cleanerDefs) {
    const authUserId = userIdMap[def.email];
    if (!authUserId) throw new Error(`No auth user ID for ${def.email}`);

    await admin.from("cleaners").upsert({
      id: def.id,
      full_name: def.name,
      email: def.email,
      phone: TEST_PHONES[`cleaner${Object.values(CLEANER_IDS).indexOf(def.id) + 1}`],
      auth_user_id: authUserId,
      status: def.status,
      is_active: def.is_active,
      is_available: def.is_available,
      can_do_deep_cleaning: def.can_do_deep_cleaning,
      can_do_move_cleaning: def.can_do_move_cleaning,
      tier: def.tier,
      latitude: def.latitude,
      longitude: def.longitude,
      ...(def.joined_at ? { joined_at: def.joined_at } : {}),
      availability_weekdays: def.weekdays,
      rating: def.tier === "gold" ? 4.9 : def.tier === "silver" ? 4.6 : 4.3,
      jobs_completed: def.tier === "gold" ? 142 : def.tier === "silver" ? 67 : 12,
      acceptance_rate: 0.95,
    }, { onConflict: "id" });

    // cleaner_locations: delete stale then insert fresh
    await admin.from("cleaner_locations").delete().eq("cleaner_id", def.id);
    for (const locSlug of def.locations) {
      const locId = locationIdMap[locSlug];
      if (!locId) { console.warn(`  [warn] location ${locSlug} not found — skipping`); continue; }
      await admin.from("cleaner_locations").insert({ cleaner_id: def.id, location_id: locId });
    }

    // cleaner_availability: next 30 days on working weekdays
    await admin.from("cleaner_availability").delete().eq("cleaner_id", def.id);
    const weekdayMap = { sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6 };
    const availDays = def.weekdays.map((d) => weekdayMap[d]);
    for (let offset = 0; offset < 30; offset++) {
      const date = new Date();
      date.setDate(date.getDate() + offset);
      if (availDays.includes(date.getDay())) {
        await admin.from("cleaner_availability").insert({
          cleaner_id: def.id,
          date: date.toISOString().slice(0, 10),
          start_time: "08:00",
          end_time: "16:00",
          is_available: def.is_available,
        });
      }
    }
  }

  return cleanerDefs;
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase 5 — Bookings
// ──────────────────────────────────────────────────────────────────────────────

async function seedBookings(admin, userIdMap, locationIdMap) {
  const custIds = {
    c1: userIdMap["customer.one@example.com"],
    c2: userIdMap["customer.two@example.com"],
    c3: userIdMap["customer.three@example.com"],
    c4: userIdMap["customer.four@example.com"],
    c5: userIdMap["customer.five@example.com"],
    c6: userIdMap["customer.six@example.com"],
    c7: userIdMap["customer.seven@example.com"],
    c8: userIdMap["customer.eight@example.com"],
  };

  const seaPtLocId  = locationIdMap["sea-point"];
  const clarLocId   = locationIdMap["claremont"];
  const rondLocId   = locationIdMap["rondebosch"];
  const obsLocId    = locationIdMap["observatory"];
  const newLocId    = locationIdMap["newlands"];

  function booking(overrides) {
    return {
      currency: "ZAR",
      status: "pending",
      is_test: true,
      service_slug: "regular-cleaning",
      service_fee_cents: 3000,
      ...overrides,
    };
  }

  const bookings = [
    // 1. Completed standard cleaning — C1, Cleaner1, Sea Point
    booking({
      id: BOOKING_IDS.completed_standard,
      paystack_reference: `${SEED_TAG}-BK-001`,
      customer_email: "customer.one@example.com",
      customer_name: "Dev Customer One",
      customer_phone: TEST_PHONES.cust1,
      customer_id: custIds.c1,
      cleaner_id: CLEANER_IDS.c1,
      status: "completed",
      amount_paid_cents: 54800,
      total_paid_zar: 548,
      service: "Standard Cleaning",
      service_slug: "regular-cleaning",
      rooms: 3, bathrooms: 2,
      location: "Sea Point", suburb: "Sea Point", city: "Cape Town",
      location_id: seaPtLocId,
      date: isoDate(-14), time: "09:00",
      price_snapshot: { basePrice: 350, bedrooms: 3, bathrooms: 2, pricePerBedroom: 80, pricePerBathroom: 60, total: 548 },
      display_earnings_cents: 29800, payout_earnings_cents: 29800, internal_earnings_cents: 25000,
      // eligible + frozen_cents satisfies bookings_eligible_paid_require_frozen_cents constraint
      payout_status: "eligible", payout_frozen_cents: 29800,
      dispatch_status: "assigned",
    }),

    // 2. Completed deep cleaning — C2, Cleaner5, Claremont
    booking({
      id: BOOKING_IDS.completed_deep,
      paystack_reference: `${SEED_TAG}-BK-002`,
      customer_email: "customer.two@example.com",
      customer_name: "Dev Customer Two",
      customer_phone: TEST_PHONES.cust2,
      customer_id: custIds.c2,
      cleaner_id: CLEANER_IDS.c5,
      status: "completed",
      amount_paid_cents: 133000,
      total_paid_zar: 1330,
      service: "Deep Cleaning",
      service_slug: "deep-cleaning",
      rooms: 3, bathrooms: 2,
      location: "Claremont", suburb: "Claremont", city: "Cape Town",
      location_id: clarLocId,
      date: isoDate(-7), time: "08:00",
      price_snapshot: { basePrice: 950, bedrooms: 3, bathrooms: 2, total: 1330 },
      display_earnings_cents: 79800, payout_earnings_cents: 79800, internal_earnings_cents: 53200,
      payout_status: "pending", dispatch_status: "assigned",
    }),

    // 3. Completed standard — C1, Cleaner1 (for earnings/payout testing)
    booking({
      id: BOOKING_IDS.completed_earnings_1,
      paystack_reference: `${SEED_TAG}-BK-003`,
      customer_email: "customer.one@example.com",
      customer_name: "Dev Customer One",
      customer_phone: TEST_PHONES.cust1,
      customer_id: custIds.c1,
      cleaner_id: CLEANER_IDS.c1,
      status: "completed",
      amount_paid_cents: 43000,
      total_paid_zar: 430,
      service: "Standard Cleaning",
      service_slug: "regular-cleaning",
      rooms: 2, bathrooms: 1,
      location: "Sea Point", suburb: "Sea Point", city: "Cape Town",
      location_id: seaPtLocId,
      date: isoDate(-21), time: "10:00",
      price_snapshot: { basePrice: 350, bedrooms: 2, bathrooms: 1, total: 430 },
      display_earnings_cents: 23650, payout_earnings_cents: 23650, internal_earnings_cents: 19350,
      payout_status: "eligible", payout_frozen_cents: 23650,
      dispatch_status: "assigned",
    }),

    // 4. Completed standard — C1, Cleaner2 (for earnings testing — pending payout)
    booking({
      id: BOOKING_IDS.completed_earnings_2,
      paystack_reference: `${SEED_TAG}-BK-004`,
      customer_email: "customer.one@example.com",
      customer_name: "Dev Customer One",
      customer_phone: TEST_PHONES.cust1,
      customer_id: custIds.c1,
      cleaner_id: CLEANER_IDS.c2,
      status: "completed",
      amount_paid_cents: 54800,
      total_paid_zar: 548,
      service: "Standard Cleaning",
      service_slug: "regular-cleaning",
      rooms: 3, bathrooms: 2,
      location: "Claremont", suburb: "Claremont", city: "Cape Town",
      location_id: clarLocId,
      date: isoDate(-10), time: "08:30",
      price_snapshot: { basePrice: 350, bedrooms: 3, bathrooms: 2, total: 548 },
      display_earnings_cents: 30140, payout_earnings_cents: 30140, internal_earnings_cents: 24660,
      payout_status: "pending", dispatch_status: "assigned",
    }),

    // 5. Upcoming paid booking — C4, Sea Point
    booking({
      id: BOOKING_IDS.upcoming_paid,
      paystack_reference: `${SEED_TAG}-BK-005`,
      customer_email: "customer.four@example.com",
      customer_name: "Dev Customer Four",
      customer_phone: TEST_PHONES.cust4,
      customer_id: custIds.c4,
      status: "paid",
      amount_paid_cents: 43000,
      total_paid_zar: 430,
      service: "Standard Cleaning",
      service_slug: "regular-cleaning",
      rooms: 2, bathrooms: 1,
      location: "Sea Point", suburb: "Sea Point", city: "Cape Town",
      location_id: seaPtLocId,
      date: isoDate(5), time: "09:00",
      price_snapshot: { total: 430 },
      dispatch_status: "searching",
    }),

    // 6. Unpaid / awaiting payment — C5, Observatory
    booking({
      id: BOOKING_IDS.unpaid_awaiting,
      paystack_reference: `${SEED_TAG}-BK-006`,
      customer_email: "customer.five@example.com",
      customer_name: "Dev Customer Five",
      customer_phone: TEST_PHONES.cust5,
      customer_id: custIds.c5,
      status: "pending",
      amount_paid_cents: 0,
      service_slug: "regular-cleaning",
      location: "Observatory", suburb: "Observatory", city: "Cape Town",
      location_id: obsLocId,
      date: isoDate(3), time: "10:00",
      price_snapshot: { total: 430 },
    }),

    // 7. Failed payment — C6, Sea Point
    booking({
      id: BOOKING_IDS.failed_payment,
      paystack_reference: `${SEED_TAG}-BK-007`,
      customer_email: "customer.six@example.com",
      customer_name: "Dev Customer Six",
      customer_phone: TEST_PHONES.cust6,
      customer_id: custIds.c6,
      status: "pending",
      amount_paid_cents: 0,
      payment_status: "failed",
      service_slug: "regular-cleaning",
      location: "Sea Point", suburb: "Sea Point", city: "Cape Town",
      location_id: seaPtLocId,
      date: isoDate(2), time: "11:00",
      price_snapshot: { total: 380 },
    }),

    // 8. Cancelled booking — C3
    booking({
      id: BOOKING_IDS.cancelled,
      paystack_reference: `${SEED_TAG}-BK-008`,
      customer_email: "customer.three@example.com",
      customer_name: "Dev Customer Three",
      customer_phone: TEST_PHONES.cust3,
      customer_id: custIds.c3,
      status: "cancelled",
      amount_paid_cents: 0,
      service_slug: "deep-cleaning",
      location: "Claremont", suburb: "Claremont", city: "Cape Town",
      location_id: clarLocId,
      date: isoDate(-5),
      price_snapshot: { total: 1030 },
    }),

    // 9. Refunded booking — C2, Claremont
    booking({
      id: BOOKING_IDS.refunded,
      paystack_reference: `${SEED_TAG}-BK-009`,
      customer_email: "customer.two@example.com",
      customer_name: "Dev Customer Two",
      customer_phone: TEST_PHONES.cust2,
      customer_id: custIds.c2,
      status: "refunded",
      amount_paid_cents: 54800,
      total_paid_zar: 548,
      service_slug: "regular-cleaning",
      location: "Claremont", suburb: "Claremont", city: "Cape Town",
      location_id: clarLocId,
      date: isoDate(-30),
      price_snapshot: { total: 548 },
    }),

    // 10. Completed move-out cleaning — C8, Rondebosch, Cleaner5
    booking({
      id: BOOKING_IDS.move_completed,
      paystack_reference: `${SEED_TAG}-BK-010`,
      customer_email: "customer.eight@example.com",
      customer_name: "Dev Customer Eight",
      customer_phone: TEST_PHONES.cust8,
      customer_id: custIds.c8,
      cleaner_id: CLEANER_IDS.c5,
      status: "completed",
      amount_paid_cents: 145000,
      total_paid_zar: 1450,
      service: "Moving Cleaning",
      service_slug: "moving-cleaning",
      rooms: 3, bathrooms: 2,
      location: "Rondebosch", suburb: "Rondebosch", city: "Cape Town",
      location_id: rondLocId,
      date: isoDate(-3), time: "08:00",
      price_snapshot: { basePrice: 1100, bedrooms: 3, bathrooms: 2, total: 1450 },
      display_earnings_cents: 81200, payout_earnings_cents: 81200, internal_earnings_cents: 63800,
      payout_status: "eligible", payout_frozen_cents: 81200,
      dispatch_status: "assigned", is_team_job: false,
    }),

    // 11. Office cleaning scheduled — C4, Newlands
    booking({
      id: BOOKING_IDS.office_scheduled,
      paystack_reference: `${SEED_TAG}-BK-011`,
      customer_email: "customer.four@example.com",
      customer_name: "Dev Customer Four",
      customer_phone: TEST_PHONES.cust4,
      customer_id: custIds.c4,
      status: "paid",
      amount_paid_cents: 63000,
      total_paid_zar: 630,
      service: "Office Cleaning",
      service_slug: "office-cleaning",
      rooms: 2, bathrooms: 1,
      location: "Newlands", suburb: "Newlands", city: "Cape Town",
      location_id: newLocId,
      date: isoDate(10), time: "08:00",
      price_snapshot: { total: 630 },
      dispatch_status: "searching",
    }),

    // 12. Carpet cleaning completed — C1, Cleaner1
    booking({
      id: BOOKING_IDS.carpet_completed,
      paystack_reference: `${SEED_TAG}-BK-012`,
      customer_email: "customer.one@example.com",
      customer_name: "Dev Customer One",
      customer_phone: TEST_PHONES.cust1,
      customer_id: custIds.c1,
      cleaner_id: CLEANER_IDS.c1,
      status: "completed",
      amount_paid_cents: 65000,
      total_paid_zar: 650,
      service: "Carpet Cleaning",
      service_slug: "carpet-cleaning",
      rooms: 3, bathrooms: 0,
      location: "Sea Point", suburb: "Sea Point", city: "Cape Town",
      location_id: seaPtLocId,
      date: isoDate(-42), time: "09:00",
      price_snapshot: { basePrice: 500, bedrooms: 3, total: 650 },
      display_earnings_cents: 36400, payout_earnings_cents: 36400, internal_earnings_cents: 28600,
      payout_status: "eligible", payout_frozen_cents: 36400,
      dispatch_status: "assigned",
    }),

    // 13. Multi-cleaner booking (team) — C1, deep cleaning
    booking({
      id: BOOKING_IDS.multi_cleaner,
      paystack_reference: `${SEED_TAG}-BK-013`,
      customer_email: "customer.one@example.com",
      customer_name: "Dev Customer One",
      customer_phone: TEST_PHONES.cust1,
      customer_id: custIds.c1,
      cleaner_id: CLEANER_IDS.c3,
      status: "paid",
      amount_paid_cents: 133000,
      total_paid_zar: 1330,
      service: "Deep Cleaning",
      service_slug: "deep-cleaning",
      rooms: 4, bathrooms: 2,
      location: "Sea Point", suburb: "Sea Point", city: "Cape Town",
      location_id: seaPtLocId,
      date: isoDate(3), time: "08:00",
      is_team_job: true,
      payout_owner_cleaner_id: CLEANER_IDS.c3,  // required when is_team_job=true
      price_snapshot: { total: 1330 },
      dispatch_status: "assigned",
    }),

    // 14. Draft booking — C5, incomplete
    booking({
      id: BOOKING_IDS.draft,
      paystack_reference: `${SEED_TAG}-BK-014`,
      customer_email: "customer.five@example.com",
      customer_name: "Dev Customer Five",
      customer_phone: TEST_PHONES.cust5,
      customer_id: custIds.c5,
      status: "pending",
      amount_paid_cents: 0,
      service_slug: "regular-cleaning",
      location: "Observatory", suburb: "Observatory",
      location_id: obsLocId,
      price_snapshot: { total: 380 },
    }),

    // 15. Monthly billing booking — C3 (monthly billing customer)
    booking({
      id: BOOKING_IDS.monthly_billing_1,
      paystack_reference: `${SEED_TAG}-BK-015`,
      customer_email: "customer.three@example.com",
      customer_name: "Dev Customer Three",
      customer_phone: TEST_PHONES.cust3,
      customer_id: custIds.c3,
      cleaner_id: CLEANER_IDS.c2,
      status: "completed",
      amount_paid_cents: 0, // monthly billing — charged via invoice
      total_paid_zar: 0,
      service_slug: "regular-cleaning",
      location: "Claremont", suburb: "Claremont", city: "Cape Town",
      location_id: clarLocId,
      date: isoDate(-5), time: "09:00",
      is_monthly_billing_booking: true,
      price_snapshot: { total: 480 },
      payout_status: "pending",
      dispatch_status: "assigned",
      display_earnings_cents: 26400,
    }),
  ];

  for (const bk of bookings) {
    const { error } = await admin
      .from("bookings")
      .upsert(bk, { onConflict: "paystack_reference" });
    if (error) throw new Error(`Booking ${bk.paystack_reference}: ${error.message}`);
  }

  return { count: bookings.length, custIds };
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase 6 — Recurring Bookings
// ──────────────────────────────────────────────────────────────────────────────

async function seedRecurringBookings(admin, userIdMap, locationIdMap) {
  const c7 = userIdMap["customer.seven@example.com"];
  const c3 = userIdMap["customer.three@example.com"];
  const seaPtLocId = locationIdMap["sea-point"];
  const clarLocId  = locationIdMap["claremont"];

  const rows = [
    // Weekly recurring — C7, preferred Cleaner3
    {
      id: RECURRING_IDS.weekly,
      customer_id: c7,
      frequency: "weekly",
      days_of_week: [2],  // Tuesday
      start_date: isoDate(-30),
      price: 430,
      status: "active",
      next_run_date: isoDate(1),
      preferred_cleaner_id: CLEANER_IDS.c3,
      booking_snapshot_template: {
        service_slug: "regular-cleaning",
        rooms: 2, bathrooms: 1,
        suburb: "Sea Point", location_id: seaPtLocId,
        customer_email: "customer.seven@example.com",
        customer_phone: TEST_PHONES.cust7,
      },
    },
    // Fortnightly recurring — C7
    {
      id: RECURRING_IDS.fortnightly,
      customer_id: c7,
      frequency: "biweekly",
      days_of_week: [4],  // Thursday
      start_date: isoDate(-14),
      price: 548,
      status: "active",
      next_run_date: isoDate(3),
      preferred_cleaner_id: null,
      booking_snapshot_template: {
        service_slug: "regular-cleaning",
        rooms: 3, bathrooms: 2,
        suburb: "Sea Point", location_id: seaPtLocId,
        customer_email: "customer.seven@example.com",
        customer_phone: TEST_PHONES.cust7,
      },
    },
    // Monthly recurring — C3 (monthly billing)
    {
      id: RECURRING_IDS.monthly,
      customer_id: c3,
      frequency: "monthly",
      days_of_week: [3],  // Wednesday
      start_date: isoDate(-60),
      price: 480,
      status: "active",
      next_run_date: isoDate(10),
      preferred_cleaner_id: CLEANER_IDS.c2,
      booking_snapshot_template: {
        service_slug: "regular-cleaning",
        rooms: 2, bathrooms: 2,
        suburb: "Claremont", location_id: clarLocId,
        customer_email: "customer.three@example.com",
        customer_phone: TEST_PHONES.cust3,
      },
    },
  ];

  for (const row of rows) {
    await admin.from("recurring_bookings").upsert(row, { onConflict: "id" });
  }
  return rows.length;
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase 7 — Cleaner Earnings & Payouts
// ──────────────────────────────────────────────────────────────────────────────

async function seedFinance(admin, userIdMap) {
  const admin1Id = userIdMap["admin.one@example.com"];
  const admin2Id = userIdMap["admin.two@example.com"];

  // cleaner_earnings — one per completed booking per cleaner
  const earnings = [
    // Cleaner1: BK-001 paid
    {
      id: EARNING_IDS.e1, cleaner_id: CLEANER_IDS.c1,
      booking_id: BOOKING_IDS.completed_standard,
      amount_cents: 29800, status: "paid",
      approved_at: new Date(Date.now() - 7*24*3600*1000).toISOString(),
      paid_at: new Date(Date.now() - 5*24*3600*1000).toISOString(),
    },
    // Cleaner1: BK-003 approved (ready for payout)
    {
      id: EARNING_IDS.e2, cleaner_id: CLEANER_IDS.c1,
      booking_id: BOOKING_IDS.completed_earnings_1,
      amount_cents: 23650, status: "approved",
      approved_at: new Date(Date.now() - 3*24*3600*1000).toISOString(),
    },
    // Cleaner2: BK-004 pending (awaiting admin approval)
    {
      id: EARNING_IDS.e3, cleaner_id: CLEANER_IDS.c2,
      booking_id: BOOKING_IDS.completed_earnings_2,
      amount_cents: 30140, status: "pending",
    },
    // Cleaner5: BK-002 pending
    {
      id: EARNING_IDS.e4, cleaner_id: CLEANER_IDS.c5,
      booking_id: BOOKING_IDS.completed_deep,
      amount_cents: 79800, status: "pending",
    },
    // Cleaner1: BK-012 (carpet) paid
    {
      id: EARNING_IDS.e5, cleaner_id: CLEANER_IDS.c1,
      booking_id: BOOKING_IDS.carpet_completed,
      amount_cents: 36400, status: "paid",
      approved_at: new Date(Date.now() - 35*24*3600*1000).toISOString(),
      paid_at: new Date(Date.now() - 33*24*3600*1000).toISOString(),
    },
  ];

  for (const row of earnings) {
    // Idempotent: delete-and-reinsert by known id
    await admin.from("cleaner_earnings").upsert(row, { onConflict: "id" });
  }

  // cleaner_payout_runs
  await admin.from("cleaner_payout_runs").upsert([
    { id: PAYOUT_RUN_IDS.draft,    status: "draft",    total_amount_cents: 0 },
    { id: PAYOUT_RUN_IDS.approved, status: "approved", total_amount_cents: 183600,
      approved_at: new Date(Date.now() - 4*24*3600*1000).toISOString() },
  ], { onConflict: "id" });

  // cleaner_payouts
  const payoutPeriodStart = lastMonthStart();
  const payoutPeriodEnd   = lastMonthEnd();
  const payouts = [
    // Cleaner1: pending
    {
      id: PAYOUT_IDS.p1_pending, cleaner_id: CLEANER_IDS.c1,
      total_amount_cents: 23650, status: "pending",
      period_start: payoutPeriodStart, period_end: payoutPeriodEnd,
      payment_status: "pending",
    },
    // Cleaner1: frozen (batched in draft run)
    {
      id: PAYOUT_IDS.p2_frozen, cleaner_id: CLEANER_IDS.c1,
      total_amount_cents: 36400, status: "frozen",
      period_start: isoDate(-35), period_end: isoDate(-28),
      payout_run_id: PAYOUT_RUN_IDS.draft,
      frozen_at: new Date(Date.now() - 2*24*3600*1000).toISOString(),
      payment_status: "pending",
    },
    // Cleaner2: approved (in approved run)
    {
      id: PAYOUT_IDS.p3_approved, cleaner_id: CLEANER_IDS.c2,
      total_amount_cents: 30140, status: "approved",
      period_start: payoutPeriodStart, period_end: payoutPeriodEnd,
      payout_run_id: PAYOUT_RUN_IDS.approved,
      approved_at: new Date(Date.now() - 3*24*3600*1000).toISOString(),
      payment_status: "pending", created_by: admin1Id,
    },
    // Cleaner5: paid
    {
      id: PAYOUT_IDS.p4_paid, cleaner_id: CLEANER_IDS.c5,
      total_amount_cents: 79800, status: "paid",
      period_start: isoDate(-21), period_end: isoDate(-14),
      approved_at: new Date(Date.now() - 14*24*3600*1000).toISOString(),
      paid_at: new Date(Date.now() - 7*24*3600*1000).toISOString(),
      payment_status: "success",
    },
    // Cleaner6: cancelled
    {
      id: PAYOUT_IDS.p5_cancelled, cleaner_id: CLEANER_IDS.c6,
      total_amount_cents: 0, status: "cancelled",
      period_start: payoutPeriodStart, period_end: payoutPeriodEnd,
      payment_status: "pending",
    },
  ];

  for (const p of payouts) {
    await admin.from("cleaner_payouts").upsert(p, { onConflict: "id" });
  }

  return { earningsCount: earnings.length, payoutsCount: payouts.length };
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase 8 — Monthly Invoices
// ──────────────────────────────────────────────────────────────────────────────

async function seedInvoices(admin, userIdMap) {
  const c3 = userIdMap["customer.three@example.com"];
  const today = new Date().toISOString().slice(0, 10);
  const lastDayOfCurrentMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
    .toISOString().slice(0, 10);

  // Use (customer_id, month) as the upsert key since that's the unique constraint.
  // Remove id from insert to avoid PK conflict with pre-existing rows; the DB will
  // keep or generate the id. billing_email is not a real column (no-op field removed).
  const invoices = [
    // Draft invoice for current month — C3
    {
      customer_id: c3,
      month: currentMonth(),
      total_bookings: 1,
      total_amount_cents: 48000,
      amount_paid_cents: 0,
      status: "draft",
      due_date: lastDayOfCurrentMonth,
      currency_code: "ZAR",
    },
    // Sent invoice for last month — C3
    {
      customer_id: c3,
      month: lastMonth(),
      total_bookings: 2,
      total_amount_cents: 96000,
      amount_paid_cents: 0,
      status: "sent",
      sent_at: new Date(Date.now() - 5*24*3600*1000).toISOString(),
      due_date: isoDate(-2),
      currency_code: "ZAR",
    },
  ];

  let insertedCount = 0;
  for (const row of invoices) {
    const { error } = await admin
      .from("monthly_invoices")
      .upsert(row, { onConflict: "customer_id,month" });
    if (error) {
      console.warn(`  [warn] monthly_invoice ${row.month}: ${error.message}`);
    } else {
      insertedCount++;
    }
  }
  return insertedCount;
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase 9 — Admin maker-checker proposals
// ──────────────────────────────────────────────────────────────────────────────

async function seedProposals(admin, userIdMap) {
  const admin1 = userIdMap["admin.one@example.com"];
  const admin2 = userIdMap["admin.two@example.com"];

  const proposals = [
    // Pending — proposed by admin.one, needs admin.two to approve (maker-checker)
    {
      id: PROPOSAL_IDS.pending_by_admin1,
      action_type: "adjust_payout_earnings",
      booking_id: BOOKING_IDS.completed_earnings_2,
      payload: { amount_cents: 32000, reason: "DEV SEED: adjustment test" },
      proposed_by: admin1,
      proposed_by_email: "admin.one@example.com",
      status: "pending",
      expires_at: new Date(Date.now() + 24*3600*1000).toISOString(),
    },
    // Pending — proposed by admin.two, needs admin.one to approve
    {
      id: PROPOSAL_IDS.pending_by_admin2,
      action_type: "adjust_payout_earnings",
      booking_id: BOOKING_IDS.completed_deep,
      payload: { amount_cents: 82000, reason: "DEV SEED: second test proposal" },
      proposed_by: admin2,
      proposed_by_email: "admin.two@example.com",
      status: "pending",
      expires_at: new Date(Date.now() + 24*3600*1000).toISOString(),
    },
    // Rejected (for testing rejected scenario)
    {
      id: PROPOSAL_IDS.rejected,
      action_type: "adjust_payout_earnings",
      booking_id: BOOKING_IDS.completed_standard,
      payload: { amount_cents: 25000, reason: "DEV SEED: rejected proposal" },
      proposed_by: admin1,
      proposed_by_email: "admin.one@example.com",
      status: "rejected",
      reviewed_by: admin2,
      reviewed_at: new Date(Date.now() - 2*3600*1000).toISOString(),
      review_note: "DEV SEED: Rejected for testing",
      expires_at: new Date(Date.now() + 20*3600*1000).toISOString(),
    },
    // Approved
    {
      id: PROPOSAL_IDS.approved,
      action_type: "adjust_payout_earnings",
      booking_id: BOOKING_IDS.carpet_completed,
      payload: { amount_cents: 37000, reason: "DEV SEED: approved proposal" },
      proposed_by: admin2,
      proposed_by_email: "admin.two@example.com",
      status: "approved",
      reviewed_by: admin1,
      reviewed_at: new Date(Date.now() - 1*3600*1000).toISOString(),
      review_note: "DEV SEED: Approved for testing",
      expires_at: new Date(Date.now() + 20*3600*1000).toISOString(),
    },
    // Expired
    {
      id: PROPOSAL_IDS.expired,
      action_type: "reprice_booking_details",
      booking_id: BOOKING_IDS.completed_earnings_1,
      payload: { total_zar: 450, reason: "DEV SEED: expired proposal" },
      proposed_by: admin1,
      proposed_by_email: "admin.one@example.com",
      status: "expired",
      expires_at: new Date(Date.now() - 2*3600*1000).toISOString(),
    },
  ];

  for (const row of proposals) {
    await admin.from("admin_money_action_proposals").upsert(row, { onConflict: "id" });
  }
  return proposals.length;
}

// ──────────────────────────────────────────────────────────────────────────────
// Reset — wipe all seed rows
// ──────────────────────────────────────────────────────────────────────────────

async function resetSeedRows(admin) {
  console.log("[seed-dev] Resetting dev seed rows...");

  // Reverse dependency order
  await admin.from("admin_money_action_proposals")
    .delete().in("id", Object.values(PROPOSAL_IDS));
  await admin.from("monthly_invoices")
    .delete().in("id", Object.values(INVOICE_IDS));
  await admin.from("cleaner_payouts")
    .delete().in("id", Object.values(PAYOUT_IDS));
  await admin.from("cleaner_payout_runs")
    .delete().in("id", Object.values(PAYOUT_RUN_IDS));
  await admin.from("cleaner_earnings")
    .delete().in("id", Object.values(EARNING_IDS));
  await admin.from("recurring_bookings")
    .delete().in("id", Object.values(RECURRING_IDS));
  await admin.from("bookings")
    .delete().like("paystack_reference", `${SEED_TAG}-%`);
  for (const cleanerId of Object.values(CLEANER_IDS)) {
    await admin.from("cleaner_availability").delete().eq("cleaner_id", cleanerId);
    await admin.from("cleaner_locations").delete().eq("cleaner_id", cleanerId);
    await admin.from("cleaners").delete().eq("id", cleanerId);
  }

  console.log("[seed-dev] Reset complete.");
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const reset  = args.includes("--reset");
  const dryRun = args.includes("--dry-run");

  // Load env
  const envFile = resolve(root, "apps/web/.env.local");
  const envVars = loadEnvFile(envFile);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || envVars.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || envVars.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!url || !serviceKey) {
    console.error("[seed-dev] ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    console.error("          Set them in apps/web/.env.local or as environment variables.");
    process.exit(1);
  }

  // Multi-layer safety guard
  let guardResult;
  try {
    guardResult = assertNonProductionSeed(url, envVars);
  } catch (err) {
    console.error(`[seed-dev] ${err.message}`);
    process.exit(1);
  }
  const { projectRef, appEnv } = guardResult;

  console.log(`[seed-dev] Project: ${projectRef} | SHALEAN_APP_ENV: ${appEnv} — non-production ✓`);

  if (dryRun) {
    console.log("[seed-dev] DRY RUN — would seed:");
    console.log("  Cities/Locations: 1 city, 7 suburbs");
    console.log("  Catalog: 6 pricing_services, 26 pricing_extras, 1 pricing_booking_config, 6 services");
    console.log(`  Auth users: ${ADMIN_USERS.length} admins, ${CLEANER_USERS.length} cleaners, ${CUSTOMER_USERS.length} customers`);
    console.log("  Cleaners: 6 (with cleaner_locations + cleaner_availability)");
    console.log("  Bookings: 15 representative");
    console.log("  Recurring: 3 (weekly, fortnightly, monthly)");
    console.log("  Earnings: 5 | Payout runs: 2 | Payouts: 5");
    console.log("  Monthly invoices: 2");
    console.log("  Admin proposals: 5 (pending/rejected/approved/expired)");
    return;
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (reset) {
    await resetSeedRows(admin);
  }

  const t0 = Date.now();

  console.log("[seed-dev] Phase 1: Cities & Locations");
  const { cityId, locationIdMap } = await seedCitiesAndLocations(admin);
  console.log(`  Cape Town city: ${cityId}`);
  console.log(`  Locations: ${Object.keys(locationIdMap).join(", ")}`);

  console.log("[seed-dev] Phase 2: Pricing Catalog");
  const { pricingServicesCount, extrasCount } = await seedCatalog(admin);
  console.log(`  pricing_services: ${pricingServicesCount} | pricing_extras: ${extrasCount}`);

  console.log("[seed-dev] Phase 3: Auth Users & Profiles");
  const userIdMap = await seedAuthUsers(admin);
  console.log(`  Created/updated: ${Object.keys(userIdMap).length} users`);

  console.log("[seed-dev] Phase 4: Cleaners (with locations + availability)");
  await seedCleaners(admin, userIdMap, locationIdMap);
  console.log(`  Cleaners: ${Object.keys(CLEANER_IDS).length}`);

  console.log("[seed-dev] Phase 5: Bookings");
  const { count: bookingCount } = await seedBookings(admin, userIdMap, locationIdMap);
  console.log(`  Bookings: ${bookingCount}`);

  console.log("[seed-dev] Phase 6: Recurring Bookings");
  const recurringCount = await seedRecurringBookings(admin, userIdMap, locationIdMap);
  console.log(`  Recurring: ${recurringCount}`);

  console.log("[seed-dev] Phase 7: Finance (earnings, payouts)");
  const { earningsCount, payoutsCount } = await seedFinance(admin, userIdMap);
  console.log(`  Earnings: ${earningsCount} | Payouts: ${payoutsCount}`);

  console.log("[seed-dev] Phase 8: Monthly Invoices");
  const invoiceCount = await seedInvoices(admin, userIdMap);
  console.log(`  Invoices: ${invoiceCount}`);

  console.log("[seed-dev] Phase 9: Admin Proposals");
  const proposalCount = await seedProposals(admin, userIdMap);
  console.log(`  Proposals: ${proposalCount}`);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n[seed-dev] ✓ Seed complete in ${elapsed}s`);
  console.log("[seed-dev] Summary:");
  console.log("  Cities: 1  |  Locations: 7");
  console.log(`  pricing_services: ${pricingServicesCount}  |  pricing_extras: ${extrasCount}`);
  console.log(`  Auth users: ${Object.keys(userIdMap).length} (3 admin, 6 cleaner, 8 customer)`);
  console.log("  Cleaners: 6  |  cleaner_locations: up to 12  |  cleaner_availability: ~120 rows");
  console.log(`  Bookings: ${bookingCount}  |  Recurring: ${recurringCount}`);
  console.log(`  Earnings: ${earningsCount}  |  Payout runs: 2  |  Payouts: ${payoutsCount}`);
  console.log(`  Monthly invoices: ${invoiceCount}  |  Admin proposals: ${proposalCount}`);
  console.log("\n[seed-dev] CONFIRM: no production PII, auth, payment, or banking data was seeded.");
}

main().catch((err) => {
  console.error("[seed-dev] FAILED:", err.message || err);
  process.exit(1);
});
