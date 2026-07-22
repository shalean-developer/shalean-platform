/**
 * Backfill bookings missing persisted `duration_minutes` so cleaner completion
 * and assign gates can proceed.
 *
 * Symptom: complete returns `completion_missing_persisted_duration` —
 * "Job duration is not on file yet…"
 *
 * Root cause: admin monthly / unified inserts historically persisted rooms but
 * not duration. Heal recomputes from rooms + service (+ extras) and writes
 * `duration_minutes` / `estimated_duration_minutes` / `duration_hours`.
 *
 * Usage:
 *   cd apps/web
 *   npm run repair:missing-booking-duration -- --dry-run
 *   npm run repair:missing-booking-duration
 *   npm run repair:missing-booking-duration -- --booking <uuid>
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  healBookingDurationForScheduling,
  resolveHealedBookingDurationMinutes,
  type HealableBookingDurationRow,
} from "../lib/booking/quote/healBookingDurationForScheduling";
import { logSystemEvent } from "../lib/logging/systemLog";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes("--dry-run");
const singleBookingArgIdx = process.argv.indexOf("--booking");
const singleBookingId =
  singleBookingArgIdx > -1 && process.argv[singleBookingArgIdx + 1]
    ? process.argv[singleBookingArgIdx + 1]!.trim()
    : null;

const ACTIVE_STATUSES = ["assigned", "in_progress", "confirmed", "offered", "pending"] as const;

type CandidateRow = HealableBookingDurationRow & {
  status?: string | null;
  location?: string | null;
  service?: string | null;
  completed_at?: string | null;
  cleaner_response_status?: string | null;
};

const SELECT =
  "id, status, date, time, location, service, service_slug, rooms, bathrooms, extras, duration_minutes, estimated_duration_minutes, duration_hours, pricing_summary, booking_snapshot, price_snapshot, completed_at, cleaner_response_status, is_team_job, team_member_count_snapshot, cleaner_count";

async function loadCandidates(admin: SupabaseClient): Promise<CandidateRow[]> {
  if (singleBookingId) {
    const { data, error } = await admin
      .from("bookings")
      .select(SELECT)
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
      .select(SELECT)
      .in("status", ACTIVE_STATUSES as unknown as string[])
      .is("duration_minutes", null)
      .order("date", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      console.error("[repair-missing-duration] candidate scan failed:", error.message);
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
  console.log(
    `[repair-missing-duration] candidates: ${candidates.length}${dryRun ? " (DRY-RUN)" : ""}`,
  );

  let attempted = 0;
  let repaired = 0;
  let skipped = 0;
  let failed = 0;
  const repairedIds: string[] = [];
  const skippedReasons = new Map<string, number>();

  for (const row of candidates) {
    attempted += 1;
    const tag = `${row.id}  ${row.date ?? "—"} ${row.time ?? "—"}  ${row.service ?? "—"}  ${row.location ?? ""}`;

    if (dryRun) {
      const minutes = resolveHealedBookingDurationMinutes(row);
      console.log(
        `[repair-missing-duration][dry] would repair ${tag} -> ${minutes ?? "UNRESOLVED"} min`,
      );
      if (minutes == null) {
        skipped += 1;
        skippedReasons.set("unresolvable", (skippedReasons.get("unresolvable") ?? 0) + 1);
      }
      continue;
    }

    try {
      const result = await healBookingDurationForScheduling(admin, row);
      if (result.durationMinutes == null) {
        skipped += 1;
        skippedReasons.set("unresolvable", (skippedReasons.get("unresolvable") ?? 0) + 1);
        console.warn(`[repair-missing-duration][skip] ${tag}: could not resolve duration`);
        continue;
      }
      if (!result.healed) {
        // Already had duration, or write failed but minutes returned
        const { data: after } = await admin
          .from("bookings")
          .select("duration_minutes")
          .eq("id", row.id)
          .maybeSingle();
        const afterMin =
          (after as { duration_minutes?: number | null } | null)?.duration_minutes ?? null;
        if (afterMin != null && Number.isFinite(afterMin) && afterMin >= 30) {
          skipped += 1;
          skippedReasons.set("already_persisted", (skippedReasons.get("already_persisted") ?? 0) + 1);
          continue;
        }
        failed += 1;
        console.error(`[repair-missing-duration][fail] ${tag}: heal did not persist`);
        continue;
      }

      repaired += 1;
      repairedIds.push(row.id);
      console.log(
        `[repair-missing-duration][ok]  ${tag}: null -> ${result.durationMinutes} min (${result.source}${
          result.usedRoomDefaults ? ", room_defaults" : ""
        })`,
      );
      void logSystemEvent({
        level: "info",
        source: "scripts/repair_missing_booking_duration",
        message: "missing_duration_repaired",
        context: {
          booking_id: row.id,
          duration_minutes: result.durationMinutes,
          heal_source: result.source,
          used_room_defaults: result.usedRoomDefaults,
          status: row.status ?? null,
        },
      });
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[repair-missing-duration][throw] ${tag}: ${msg}`);
    }
  }

  console.log(
    `[repair-missing-duration] done — attempted=${attempted} repaired=${repaired} skipped=${skipped} failed=${failed}`,
  );
  if (skippedReasons.size > 0) {
    console.log("[repair-missing-duration] skip reasons:", Object.fromEntries(skippedReasons));
  }
  if (repairedIds.length > 0) {
    console.log("[repair-missing-duration] repaired ids:");
    for (const id of repairedIds) console.log(`  ${id}`);
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[repair-missing-duration] fatal:", msg);
  process.exit(1);
});
