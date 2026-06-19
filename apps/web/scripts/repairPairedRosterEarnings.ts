/**
 * Backfill earnings_summary + booking_roster_member_payouts for paired solo roster jobs
 * (2+ booking_cleaners, is_team_job = false).
 *
 * Usage: npx tsx --env-file=.env.local apps/web/scripts/repairPairedRosterEarnings.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { persistCleanerPayoutIfUnset } from "../lib/payout/persistCleanerPayout";
import { resolvePersistCleanerIdForBooking } from "../lib/payout/bookingEarningsIntegrity";

const __dir = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(resolve(__dir, "../.env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!process.env[k]) process.env[k] = v;
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

async function loadCandidateBookingIds(client: SupabaseClient): Promise<string[]> {
  const { data: rosterRows, error } = await client
    .from("booking_cleaners")
    .select("booking_id, cleaner_id")
    .order("booking_id");
  if (error) throw new Error(error.message);

  const byBooking = new Map<string, Set<string>>();
  for (const row of rosterRows ?? []) {
    const bid = String((row as { booking_id?: string }).booking_id ?? "").trim();
    const cid = String((row as { cleaner_id?: string }).cleaner_id ?? "").trim();
    if (!bid || !cid) continue;
    if (!byBooking.has(bid)) byBooking.set(bid, new Set());
    byBooking.get(bid)!.add(cid);
  }

  const pairedIds = [...byBooking.entries()].filter(([, ids]) => ids.size >= 2).map(([id]) => id);
  if (!pairedIds.length) return [];

  const { data: bookings, error: bErr } = await client
    .from("bookings")
    .select("id, is_team_job, status")
    .in("id", pairedIds)
    .or("is_team_job.eq.false,is_team_job.is.null");
  if (bErr) throw new Error(bErr.message);

  return (bookings ?? [])
    .map((b) => String((b as { id?: string }).id ?? "").trim())
    .filter(Boolean);
}

async function main() {
  const bookingIds = await loadCandidateBookingIds(admin);
  console.log(`[repair-paired-roster] candidates=${bookingIds.length}`);

  let repaired = 0;
  let skipped = 0;
  let failed = 0;

  for (const bookingId of bookingIds) {
    const { data: row, error } = await admin
      .from("bookings")
      .select("id, cleaner_id, payout_owner_cleaner_id, is_team_job")
      .eq("id", bookingId)
      .maybeSingle();
    if (error || !row) {
      failed += 1;
      console.error(`[fail] ${bookingId}: booking load ${error?.message ?? "missing"}`);
      continue;
    }

    const cleanerId = resolvePersistCleanerIdForBooking(
      row as { cleaner_id?: string | null; payout_owner_cleaner_id?: string | null; is_team_job?: boolean | null },
    );
    if (!cleanerId) {
      skipped += 1;
      continue;
    }

    const result = await persistCleanerPayoutIfUnset({
      admin,
      bookingId,
      cleanerId,
      forceDisplayRecompute: true,
    });
    if (!result.ok) {
      failed += 1;
      console.error(`[fail] ${bookingId}: ${result.error}`);
      continue;
    }
    if (result.skipped) {
      skipped += 1;
      console.log(`[skip] ${bookingId}: ${result.skipReason ?? "skipped"}`);
      continue;
    }
    repaired += 1;
    console.log(`[ok] ${bookingId}`);
  }

  console.log(`[repair-paired-roster] done repaired=${repaired} skipped=${skipped} failed=${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
