/**
 * Backfill assigned / in_progress bookings whose `display_earnings_cents` is still
 * **null** while cleaners see a preview amount (e.g. R250) on the dashboard.
 *
 * Symptom: cleaner complete returns `payout_verify_failed` — "Pay for this job
 * could not be verified yet…" even though the job card shows a positive earning.
 *
 * Fix path: `persistCleanerPayoutIfUnset({ forceDisplayRecompute: true })` with
 * cleaner resolution from `cleaner_id`, `payout_owner_cleaner_id`, or
 * `booking_cleaners` roster (selected-cleaner flows).
 *
 * Related:
 *   - `npm run repair:zero-earning-assigned` — same statuses but null **or** 0
 *   - `POST /api/admin/bookings/[id]/reset-earnings?force=true` — single booking
 *
 * Usage:
 *   cd apps/web
 *   npm run repair:stuck-null-display-active -- --dry-run
 *   npm run repair:stuck-null-display-active
 *   npm run repair:stuck-null-display-active -- --booking <uuid>
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  hasPersistedDisplayEarningsBasis,
  isCompletableDisplayEarningsCents,
  resolvePersistCleanerIdForBookingWithRoster,
} from "../lib/payout/bookingEarningsIntegrity";
import { persistCleanerPayoutIfUnset } from "../lib/payout/persistCleanerPayout";
import { logSystemEvent } from "../lib/logging/systemLog";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes("--dry-run");
const singleBookingArgIdx = process.argv.indexOf("--booking");
const singleBookingId =
  singleBookingArgIdx > -1 && process.argv[singleBookingArgIdx + 1]
    ? process.argv[singleBookingArgIdx + 1]!.trim()
    : null;

const ACTIVE_STATUSES = ["assigned", "in_progress"] as const;

type CandidateRow = {
  id: string;
  status: string | null;
  cleaner_id: string | null;
  payout_owner_cleaner_id: string | null;
  is_team_job: boolean | null;
  display_earnings_cents: number | null;
  service: string | null;
  date: string | null;
  time: string | null;
};

async function loadCandidates(admin: SupabaseClient): Promise<CandidateRow[]> {
  if (singleBookingId) {
    const { data, error } = await admin
      .from("bookings")
      .select(
        "id, status, cleaner_id, payout_owner_cleaner_id, is_team_job, display_earnings_cents, service, date, time",
      )
      .eq("id", singleBookingId)
      .maybeSingle();
    if (error || !data) return [];
    return [data as CandidateRow];
  }

  const out: CandidateRow[] = [];
  const pageSize = 500;
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("bookings")
      .select(
        "id, status, cleaner_id, payout_owner_cleaner_id, is_team_job, display_earnings_cents, service, date, time",
      )
      .in("status", ACTIVE_STATUSES as unknown as string[])
      .is("display_earnings_cents", null)
      .order("date", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      console.error("[repair-null-display] candidate scan failed:", error.message);
      process.exit(1);
    }
    const batch = (data ?? []) as CandidateRow[];
    out.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function main(): Promise<void> {
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const candidates = await loadCandidates(admin);
  console.log(`[repair-null-display] candidates: ${candidates.length}${dryRun ? " (DRY-RUN)" : ""}`);

  let attempted = 0;
  let repaired = 0;
  let skipped = 0;
  let failed = 0;
  const repairedIds: string[] = [];
  const skippedReasons = new Map<string, number>();

  for (const row of candidates) {
    const cleanerId = await resolvePersistCleanerIdForBookingWithRoster(admin, {
      id: row.id,
      cleaner_id: row.cleaner_id,
      payout_owner_cleaner_id: row.payout_owner_cleaner_id,
      is_team_job: row.is_team_job,
    });
    if (!cleanerId) {
      skipped += 1;
      skippedReasons.set("no_cleaner_payout_owner_or_roster", (skippedReasons.get("no_cleaner_payout_owner_or_roster") ?? 0) + 1);
      continue;
    }

    attempted += 1;
    const tag = `${row.id}  ${row.date ?? "—"} ${row.time ?? "—"}  ${row.service ?? "—"}`;

    if (dryRun) {
      console.log(`[repair-null-display][dry] would repair ${tag} cleaner=${cleanerId}`);
      continue;
    }

    try {
      const result = await persistCleanerPayoutIfUnset({
        admin,
        bookingId: row.id,
        cleanerId,
        forceDisplayRecompute: true,
      });
      if (!result.ok) {
        failed += 1;
        console.error(`[repair-null-display][fail] ${tag}: ${result.error ?? result.code ?? "unknown"}`);
        continue;
      }
      if (result.skipped) {
        skipped += 1;
        const reason = result.skipReason ?? "skipped";
        skippedReasons.set(reason, (skippedReasons.get(reason) ?? 0) + 1);
        continue;
      }

      const { data: after } = await admin
        .from("bookings")
        .select("display_earnings_cents")
        .eq("id", row.id)
        .maybeSingle();
      const afterCents =
        (after as { display_earnings_cents?: number | null } | null)?.display_earnings_cents ?? null;

      if (!hasPersistedDisplayEarningsBasis(afterCents)) {
        failed += 1;
        console.error(`[repair-null-display][verify-fail] ${tag}: display still null after persist`);
        continue;
      }

      repaired += 1;
      repairedIds.push(row.id);
      const completable = isCompletableDisplayEarningsCents(afterCents);
      console.log(
        `[repair-null-display][ok]  ${tag}: null -> ${afterCents} cents${completable ? " (completable)" : " (persisted but R0 — needs ops)"}`,
      );
      void logSystemEvent({
        level: "info",
        source: "scripts/repair_stuck_null_display_active_bookings",
        message: "null_display_active_repaired",
        context: {
          booking_id: row.id,
          cleaner_id: cleanerId,
          after_display_earnings_cents: afterCents,
          completable,
          status: row.status,
        },
      });
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[repair-null-display][throw] ${tag}: ${msg}`);
    }
  }

  console.log(
    `[repair-null-display] done — attempted=${attempted} repaired=${repaired} skipped=${skipped} failed=${failed}`,
  );
  if (skippedReasons.size > 0) {
    console.log("[repair-null-display] skip reasons:", Object.fromEntries(skippedReasons));
  }
  if (repairedIds.length > 0) {
    console.log("[repair-null-display] repaired ids:");
    for (const id of repairedIds) console.log(`  ${id}`);
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[repair-null-display] fatal:", msg);
  process.exit(1);
});
