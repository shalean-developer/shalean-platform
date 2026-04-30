/**
 * Upsert `booking_cleaner_earnings_snapshot` (+ lines) for solo bookings that already have
 * `booking_line_items` but no snapshot row yet. Does not change `bookings.display_earnings_cents`.
 *
 *   cd apps/web
 *   set NEXT_PUBLIC_SUPABASE_URL=...
 *   set SUPABASE_SERVICE_ROLE_KEY=...
 *   npm run backfill:booking-earnings-snapshots -- --dry-run
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { recomputeBookingCleanerEarningsSnapshot } from "../lib/payout/recomputeBookingCleanerEarningsSnapshot";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes("--dry-run");

async function loadSnapshotBookingIds(admin: SupabaseClient): Promise<Set<string>> {
  const out = new Set<string>();
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await admin.from("booking_cleaner_earnings_snapshot").select("booking_id").range(from, from + page - 1);
    if (error) {
      console.error("list snapshots failed", error.message);
      break;
    }
    const rows = data ?? [];
    for (const r of rows as { booking_id?: string }[]) {
      const id = typeof r.booking_id === "string" ? r.booking_id : "";
      if (id) out.add(id);
    }
    if (rows.length < page) break;
    from += page;
  }
  return out;
}

async function main() {
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const haveSnap = await loadSnapshotBookingIds(admin);
  console.log(`Existing snapshots: ${haveSnap.size}`);

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let lastId = "";

  const pageSize = 100;
  for (;;) {
    let q = admin
      .from("bookings")
      .select("id, status, is_team_job")
      .eq("status", "completed")
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

    for (const b of batch as { id?: string; is_team_job?: boolean | null }[]) {
      scanned += 1;
      const id = typeof b.id === "string" ? b.id : "";
      if (!id || haveSnap.has(id) || b.is_team_job === true) {
        skipped += 1;
        continue;
      }
      const { count } = await admin.from("booking_line_items").select("id", { count: "exact", head: true }).eq("booking_id", id);
      if (!count || count < 1) {
        skipped += 1;
        continue;
      }
      if (dryRun) {
        console.log("[dry-run] would snapshot", id);
        updated += 1;
        continue;
      }
      const res = await recomputeBookingCleanerEarningsSnapshot(admin, id);
      if (!res.ok) {
        console.error("snapshot failed", id, res.error);
        continue;
      }
      if ("skipped" in res && res.skipped) {
        skipped += 1;
        continue;
      }
      updated += 1;
      haveSnap.add(id);
    }

    lastId = String((batch[batch.length - 1] as { id?: string }).id ?? "");
    if (!lastId) break;
  }

  console.log(
    dryRun
      ? `Dry run. scanned=${scanned} would_write=${updated} skipped=${skipped}`
      : `Done. scanned=${scanned} snapshots_written=${updated} skipped=${skipped}`,
  );
}

void main();
