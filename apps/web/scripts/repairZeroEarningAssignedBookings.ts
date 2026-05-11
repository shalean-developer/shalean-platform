/**
 * Find assigned / in_progress bookings whose `bookings.display_earnings_cents`
 * is **null or 0** and recompute the canonical cleaner earning via
 * `persistCleanerPayoutIfUnset({ forceDisplayRecompute: true })` so they
 * become completable again.
 *
 * Why: backfilled / recurring monthly-invoice bookings can land with
 * `display_earnings_cents = 0` when the row had no payment basis at first
 * persist (e.g. `total_paid_zar` was null and `buildBookingLineItemsFromRow`
 * priced the `(backfill)` base line at R0). Cleaners then see
 * "Job earning unavailable" and the completion API returns
 * `job_earning_unavailable` (HTTP 422). This script is the bulk repair path
 * — the per-booking equivalent is `POST /api/admin/bookings/[id]/reset-earnings?force=true`.
 *
 * Safety:
 *  - Never overwrites a positive `display_earnings_cents` (skipped:
 *    `display_earnings_already_set` from `persistCleanerPayoutIfUnset`).
 *  - Skips terminal bookings (cancelled / failed / refunded) via the persist
 *    eligibility gate.
 *  - Logs every repaired booking id + before/after cents to stdout AND to
 *    `system_logs` (`source: "scripts/repair_zero_earning_assigned_bookings"`).
 *
 *   cd apps/web
 *   # The npm script auto-loads `apps/web/.env.local` via `tsx --env-file=.env.local`.
 *   # If you keep credentials elsewhere, set them in your shell first:
 *   #   PowerShell:  $env:NEXT_PUBLIC_SUPABASE_URL = "..."; $env:SUPABASE_SERVICE_ROLE_KEY = "..."
 *   #   bash/zsh:    export NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
 *   npm run repair:zero-earning-assigned -- --dry-run
 *   npm run repair:zero-earning-assigned                                # apply
 *   npm run repair:zero-earning-assigned -- --booking <uuid>            # single id
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolvePersistCleanerIdForBooking } from "../lib/payout/bookingEarningsIntegrity";
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

const ASSIGNABLE_STATUSES = ["assigned", "in_progress"] as const;

type CandidateRow = {
  id: string;
  status: string | null;
  cleaner_id: string | null;
  payout_owner_cleaner_id: string | null;
  is_team_job: boolean | null;
  display_earnings_cents: number | null;
  cleaner_earnings_total_cents: number | null;
  service: string | null;
  date: string | null;
  time: string | null;
};

async function loadCandidates(admin: SupabaseClient): Promise<CandidateRow[]> {
  if (singleBookingId) {
    const { data, error } = await admin
      .from("bookings")
      .select(
        "id, status, cleaner_id, payout_owner_cleaner_id, is_team_job, display_earnings_cents, cleaner_earnings_total_cents, service, date, time",
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
        "id, status, cleaner_id, payout_owner_cleaner_id, is_team_job, display_earnings_cents, cleaner_earnings_total_cents, service, date, time",
      )
      .in("status", ASSIGNABLE_STATUSES as unknown as string[])
      .or("display_earnings_cents.is.null,display_earnings_cents.eq.0")
      .order("date", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      console.error("[repair] candidate scan failed:", error.message);
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
  console.log(`[repair] candidates: ${candidates.length}${dryRun ? " (DRY-RUN)" : ""}`);

  let attempted = 0;
  let repaired = 0;
  let skipped = 0;
  let failed = 0;
  const repairedIds: string[] = [];
  const skippedReasons = new Map<string, number>();

  for (const row of candidates) {
    const cleanerId = resolvePersistCleanerIdForBooking({
      cleaner_id: row.cleaner_id,
      payout_owner_cleaner_id: row.payout_owner_cleaner_id,
      is_team_job: row.is_team_job,
    });
    if (!cleanerId) {
      skipped += 1;
      skippedReasons.set("no_cleaner_or_payout_owner", (skippedReasons.get("no_cleaner_or_payout_owner") ?? 0) + 1);
      continue;
    }

    attempted += 1;
    const tag = `${row.id}  ${row.date ?? "—"} ${row.time ?? "—"}  ${row.service ?? "—"}`;

    if (dryRun) {
      console.log(`[repair][dry] would repair ${tag} (display=${row.display_earnings_cents ?? "null"})`);
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
        console.error(`[repair][fail] ${tag}: ${result.error ?? result.code ?? "unknown"}`);
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
      repaired += 1;
      repairedIds.push(row.id);
      console.log(
        `[repair][ok]  ${tag}: ${row.display_earnings_cents ?? "null"} -> ${afterCents ?? "null"} cents`,
      );
      void logSystemEvent({
        level: "info",
        source: "scripts/repair_zero_earning_assigned_bookings",
        message: "zero_earning_assigned_repaired",
        context: {
          booking_id: row.id,
          cleaner_id: cleanerId,
          before_display_earnings_cents: row.display_earnings_cents,
          after_display_earnings_cents: afterCents,
          status: row.status,
        },
      });
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[repair][throw] ${tag}: ${msg}`);
    }
  }

  console.log(
    `[repair] done — attempted=${attempted} repaired=${repaired} skipped=${skipped} failed=${failed}`,
  );
  if (skippedReasons.size > 0) {
    console.log("[repair] skip reasons:", Object.fromEntries(skippedReasons));
  }
  if (repairedIds.length > 0) {
    console.log("[repair] repaired ids:");
    for (const id of repairedIds) console.log(`  ${id}`);
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[repair] fatal:", msg);
  process.exit(1);
});
