/**
 * Backfill `booking_line_items` for bookings that have none yet (idempotent).
 *
 * From `apps/web` with service role env (same as repair-booking-extras-overflow.mjs):
 *   set NEXT_PUBLIC_SUPABASE_URL=https://....supabase.co
 *   set SUPABASE_SERVICE_ROLE_KEY=...
 *   npm run backfill:booking-line-items -- --dry-run
 *   npm run backfill:booking-line-items
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildBookingLineItemsFromRow } from "../lib/booking/buildBookingLineItemsFromRow";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const dryRun = process.argv.includes("--dry-run");

async function loadBookingsWithLineItems(admin: SupabaseClient): Promise<Set<string>> {
  const ids = new Set<string>();
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("booking_line_items")
      .select("booking_id")
      .range(from, from + pageSize - 1);
    if (error) {
      console.error("list booking_line_items failed", error.message);
      break;
    }
    const rows = data ?? [];
    for (const r of rows as { booking_id?: string }[]) {
      const id = typeof r.booking_id === "string" ? r.booking_id : "";
      if (id) ids.add(id);
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return ids;
}

async function main() {
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const already = await loadBookingsWithLineItems(admin);
  console.log(`Bookings that already have ≥1 line item: ${already.size}`);

  let scanned = 0;
  let backfilled = 0;
  let skipped = 0;
  let lastId = "";

  const pageSize = 150;
  for (;;) {
    let q = admin
      .from("bookings")
      .select("id, service, rooms, bathrooms, extras, total_paid_zar, amount_paid_cents, booking_snapshot")
      .order("id", { ascending: true })
      .limit(pageSize);
    if (lastId) q = q.gt("id", lastId);
    const { data, error } = await q;
    if (error) {
      console.error("bookings page failed", error.message);
      process.exit(1);
    }
    const batch = data ?? [];
    if (batch.length === 0) break;

    for (const raw of batch as Parameters<typeof buildBookingLineItemsFromRow>[0][]) {
      scanned += 1;
      const id = typeof raw.id === "string" ? raw.id : "";
      if (!id || already.has(id)) {
        skipped += 1;
        continue;
      }
      const items = buildBookingLineItemsFromRow(raw);
      if (items.length === 0) {
        skipped += 1;
        continue;
      }
      const rows = items.map((i) => ({ ...i, booking_id: id }));
      if (dryRun) {
        console.log("[dry-run] would insert", id, rows.length, "rows");
        backfilled += 1;
        continue;
      }
      const { error: insErr } = await admin.from("booking_line_items").insert(rows);
      if (insErr) {
        console.error("insert failed", id, insErr.message);
        continue;
      }
      backfilled += 1;
      already.add(id);
    }

    lastId = String((batch[batch.length - 1] as { id?: string }).id ?? "");
    if (!lastId) break;
  }

  console.log(
    dryRun
      ? `Dry run done. scanned=${scanned} would_backfill=${backfilled} skipped=${skipped}`
      : `Done. scanned=${scanned} backfilled=${backfilled} skipped=${skipped}`,
  );
}

void main();
