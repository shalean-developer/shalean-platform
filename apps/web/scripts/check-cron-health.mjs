/**
 * Production cron health check (reads apps/web/.env.local).
 * Usage: node scripts/check-cron-health.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(resolve(__dir, "../.env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  if (!process.env[t.slice(0, eq).trim()]) process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const secret = process.env.CRON_SECRET?.trim();

function resolveAppHost() {
  const raw = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://shalean.co.za"
  ).trim();
  if (/localhost|127\.0\.0\.1|::1/i.test(raw)) return "https://shalean.co.za";
  const base = raw.replace(/\/$/, "");
  return base.startsWith("http") ? base : `https://${base}`;
}

const host = resolveAppHost();

if (!url || !key) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

/** job_name values written by routes into cron_runs (may differ from pg_cron jobname). */
const monitored = [
  { job: "generate-recurring-bookings", maxAgeMin: 30 },
  { job: "charge-recurring-bookings", maxAgeMin: 30 },
  { job: "booking-lifecycle", maxAgeMin: 90 },
  { job: "payment-recovery", maxAgeMin: 90 },
  { job: "retry-failed-jobs", maxAgeMin: 90 },
  { job: "dispatch-timeouts", maxAgeMin: 90 },
  { job: "charge-monthly-invoices", maxAgeMin: 26 * 60 },
  { job: "payout-integrity-daily", maxAgeMin: 26 * 60 },
  { job: "send-invoice-reminders", maxAgeMin: 26 * 60 },
];

const now = Date.now();
console.log("=== cron_runs (latest success) ===\n");
const stale = [];
for (const { job, maxAgeMin } of monitored) {
  const { data, error } = await admin
    .from("cron_runs")
    .select("status,created_at,message")
    .eq("job_name", job)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    console.log(`${job}: ERROR ${error.message}`);
    continue;
  }
  const row = data?.[0];
  if (!row) {
    console.log(`${job}: NO SUCCESS EVER`);
    stale.push(job);
    continue;
  }
  const ageMin = Math.round((now - Date.parse(row.created_at)) / 60000);
  const ok = ageMin <= maxAgeMin;
  console.log(`${job}: ${ok ? "OK" : "STALE"} (${ageMin}m ago, max ${maxAgeMin}m)`);
  console.log(`  ${row.created_at} — ${String(row.message ?? "").slice(0, 90)}`);
  if (!ok) stale.push(job);
}

console.log(`\nStale/missing for health scan: ${stale.length ? stale.join(", ") : "none"}`);

console.log("\n=== pg_cron targets (Supabase scheduler) ===\n");
const { data: targets, error: targetsErr } = await admin
  .from("cron_http_targets")
  .select("app_base_url,cron_secret,updated_at")
  .eq("singleton", true)
  .maybeSingle();
if (targetsErr) {
  console.log(`cron_http_targets: ERROR ${targetsErr.message} (apply migration 20261005?)`);
} else if (!targets) {
  console.log("cron_http_targets: missing row");
} else {
  const placeholder =
    targets.app_base_url.includes("YOUR_DOMAIN") || targets.cron_secret === "YOUR_CRON_SECRET";
  console.log(
    placeholder
      ? "cron_http_targets: PLACEHOLDER — update app_base_url + cron_secret in SQL Editor"
      : `cron_http_targets: configured (${targets.app_base_url}, updated ${targets.updated_at})`,
  );
}

if (secret) {
  console.log(`\n=== production auth probe (GET → ${host}) ===\n`);
  for (const path of [
    "/api/cron/booking-lifecycle",
    "/api/cron/retry-failed-jobs",
    "/api/cron/payment-recovery",
    "/api/cron/payout-integrity-daily",
  ]) {
    try {
      const r = await fetch(`${host}${path}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${secret}`, "x-cron-secret": secret },
      });
      const text = await r.text();
      console.log(`${path}: HTTP ${r.status} ${text.slice(0, 120)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`${path}: FETCH FAILED — ${msg}`);
    }
  }
} else {
  console.log("\n(skip auth probe — CRON_SECRET missing locally)");
}
