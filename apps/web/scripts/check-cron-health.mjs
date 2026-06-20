/**
 * Quick production cron health check (reads apps/web/.env.local).
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
const base = (process.env.NEXT_PUBLIC_APP_URL || "https://shalean.co.za").replace(/\/$/, "");
const host = base.startsWith("http") ? base : `https://${base}`;

if (!url || !key) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });
const monitored = [
  { job: "generate-recurring-bookings", maxAgeMin: 30 },
  { job: "booking-lifecycle", maxAgeMin: 90 },
  { job: "retry-failed-jobs", maxAgeMin: 90 },
  { job: "charge-monthly-invoices", maxAgeMin: 26 * 60 },
  { job: "payout-integrity-daily", maxAgeMin: 26 * 60 },
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

if (secret) {
  console.log("\n=== production auth probe (GET) ===\n");
  for (const path of ["/api/cron/booking-lifecycle", "/api/cron/retry-failed-jobs", "/api/cron/payout-integrity-daily"]) {
    const r = await fetch(`${host}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${secret}`, "x-cron-secret": secret },
    });
    const text = await r.text();
    console.log(`${path}: HTTP ${r.status} ${text.slice(0, 120)}`);
  }
} else {
  console.log("\n(skip auth probe — CRON_SECRET missing locally)");
}
