#!/usr/bin/env node
/**
 * One-off repair: cap `bookings.extras` jsonb arrays that exceed MAX rows (keep logic aligned with
 * `lib/booking/sanitizeBookingExtrasForPersist.ts`).
 *
 * From `apps/web` with service role env:
 *   set NEXT_PUBLIC_SUPABASE_URL=...
 *   set SUPABASE_SERVICE_ROLE_KEY=...
 *   node scripts/repair-booking-extras-overflow.mjs --dry-run
 *   node scripts/repair-booking-extras-overflow.mjs
 */

import { createClient } from "@supabase/supabase-js";

const MAX_BOOKING_EXTRAS_ROWS = 24;

function sanitizeBookingExtrasRow(rows) {
  if (!Array.isArray(rows)) return { out: [], changed: false };
  const seen = new Set();
  const out = [];
  let skippedInvalid = 0;
  let skippedDup = 0;
  for (const raw of rows) {
    let slug = "";
    let name = "";
    let priceNum = NaN;
    if (typeof raw === "string") {
      slug = raw.trim();
      name = slug;
      priceNum = 0;
    } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      slug = typeof raw.slug === "string" ? raw.slug.trim() : "";
      name = typeof raw.name === "string" ? raw.name.trim() : "";
      const p = raw.price;
      priceNum = typeof p === "number" && Number.isFinite(p) ? p : Number(p);
    } else {
      skippedInvalid += 1;
      continue;
    }
    if (!slug) {
      skippedInvalid += 1;
      continue;
    }
    if (seen.has(slug)) {
      skippedDup += 1;
      continue;
    }
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      skippedInvalid += 1;
      continue;
    }
    const price = Math.round(Math.min(priceNum, 500_000));
    seen.add(slug);
    out.push({ slug, name: name || slug, price });
    if (out.length >= MAX_BOOKING_EXTRAS_ROWS) break;
  }
  const changed =
    rows.length > MAX_BOOKING_EXTRAS_ROWS ||
    skippedInvalid > 0 ||
    skippedDup > 0 ||
    out.length !== rows.length;
  return { out, changed };
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes("--dry-run");

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

const pageSize = 500;
let lastId = "";
let scanned = 0;
let repaired = 0;

for (;;) {
  let q = admin.from("bookings").select("id, extras").order("id", { ascending: true }).limit(pageSize);
  if (lastId) q = q.gt("id", lastId);
  const { data: batch, error } = await q;

  if (error) {
    console.error("Query failed:", error.message);
    process.exit(1);
  }
  if (!batch?.length) break;

  for (const row of batch) {
    lastId = row.id;
    scanned += 1;
    const ex = row.extras;
    if (!Array.isArray(ex) || ex.length <= MAX_BOOKING_EXTRAS_ROWS) continue;
    const { out, changed } = sanitizeBookingExtrasRow(ex);
    if (!changed) continue;
    console.log(`${dryRun ? "[dry-run] " : ""}Repair id=${row.id} extras ${ex.length} -> ${out.length}`);
    if (!dryRun) {
      const { error: upErr } = await admin.from("bookings").update({ extras: out }).eq("id", row.id);
      if (upErr) {
        console.error(`Update failed ${row.id}:`, upErr.message);
        process.exit(1);
      }
    }
    repaired += 1;
  }

  if (batch.length < pageSize) break;
}

console.log(
  `Done. Scanned ${scanned} booking rows in id order. ${dryRun ? "Would repair" : "Repaired"} ${repaired} rows whose extras array was longer than ${MAX_BOOKING_EXTRAS_ROWS} or failed dedupe/validation.`,
);
