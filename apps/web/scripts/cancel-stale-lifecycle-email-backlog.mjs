/**
 * Cancel stale booking_lifecycle_jobs before RESEND key fix.
 * Keeps jobs scheduled on/after KEEP_FROM_DATE (today + last 7 days window).
 *
 * Usage:
 *   node scripts/cancel-stale-lifecycle-email-backlog.mjs           # dry-run
 *   node scripts/cancel-stale-lifecycle-email-backlog.mjs --apply   # execute
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const KEEP_FROM_DATE = "2026-06-13"; // inclusive — keeps 13 Jun through today
const CANCEL_REASON = "ops: cancelled stale lifecycle email backlog before RESEND key rotation";

const apply = process.argv.includes("--apply");
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
if (!url || !key) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });
const cutoffIso = `${KEEP_FROM_DATE}T00:00:00.000Z`;

const { data: toCancel, error: selErr } = await admin
  .from("booking_lifecycle_jobs")
  .select("id, job_type, status, scheduled_for, customer_email, attempts")
  .in("status", ["pending", "failed"])
  .is("sent_at", null)
  .lt("scheduled_for", cutoffIso)
  .order("scheduled_for", { ascending: true });

if (selErr) {
  console.error("Select failed:", selErr.message);
  process.exit(1);
}

const rows = toCancel ?? [];
const byType = rows.reduce((m, r) => {
  m[r.job_type] = (m[r.job_type] ?? 0) + 1;
  return m;
}, {});

console.log(apply ? "APPLY" : "DRY RUN");
console.log(`Cancel lifecycle jobs with scheduled_for before ${KEEP_FROM_DATE} (${rows.length} rows)`);
console.log("By type:", byType);

if (rows.length > 0) {
  console.log("\nSample (oldest 5):");
  for (const r of rows.slice(0, 5)) {
    console.log(
      `  ${String(r.scheduled_for).slice(0, 19)} | ${r.job_type} | ${r.status} | ${r.customer_email}`,
    );
  }
}

const { data: kept, error: keepErr } = await admin
  .from("booking_lifecycle_jobs")
  .select("id", { count: "exact", head: true })
  .in("status", ["pending", "failed"])
  .is("sent_at", null)
  .gte("scheduled_for", cutoffIso);

if (keepErr) {
  console.error("Keep-count failed:", keepErr.message);
} else {
  console.log(`\nWill keep (pending/failed, unsent, scheduled >= ${KEEP_FROM_DATE}): ${kept ?? "?"}`);
}

if (!apply) {
  console.log("\nRe-run with --apply to cancel.");
  process.exit(0);
}

if (rows.length === 0) {
  console.log("\nNothing to cancel.");
  process.exit(0);
}

const ids = rows.map((r) => r.id);
const BATCH = 100;
let updated = 0;
for (let i = 0; i < ids.length; i += BATCH) {
  const batch = ids.slice(i, i + BATCH);
  const { error: upErr } = await admin
    .from("booking_lifecycle_jobs")
    .update({ status: "cancelled", last_error: CANCEL_REASON })
    .in("id", batch)
    .in("status", ["pending", "failed"])
    .is("sent_at", null);
  if (upErr) {
    console.error("Update failed:", upErr.message);
    process.exit(1);
  }
  updated += batch.length;
  console.log(`Updated batch ${i / BATCH + 1}: ${batch.length} rows`);
}

console.log(`\nCancelled ${updated} stale lifecycle email job(s).`);
