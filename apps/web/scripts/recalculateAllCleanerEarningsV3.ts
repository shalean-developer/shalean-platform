/**
 * Recompute cleaner earnings for all assigned bookings using the v3 canonical engine
 * (`persistCleanerPayoutIfUnset({ forceDisplayRecompute: true })`).
 *
 * Completed solo jobs with finalized line earnings are reset first (same safety gate as
 * `POST /api/admin/bookings/[id]/reset-earnings`) so the idempotent solo skip does not block writes.
 *
 * Skips (by design):
 *  - Terminal bookings (cancelled / failed / payment_expired) — persist eligibility gate
 *  - Locked weekly payouts (frozen / approved / paid)
 *  - Bookings already paid through payout pipeline when reset is required
 *  - Rows with non-pending `cleaner_earnings` when reset is required
 *
 *   cd apps/web
 *   npm run recalculate:cleaner-earnings-v3 -- --dry-run
 *   npm run recalculate:cleaner-earnings-v3
 *   npm run recalculate:cleaner-earnings-v3 -- --booking <uuid>
 *   npm run recalculate:cleaner-earnings-v3 -- --limit 50
 *   npm run recalculate:cleaner-earnings-v3 -- --skip-already-v3  # skip rows already on v3
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertBookingCleanerEarningsResetSafe } from "../lib/admin/adminBookingEarningsResetSafety";
import { CANONICAL_EARNINGS_MODEL_VERSION } from "../lib/payout/canonicalCleanerPayout";
import { resolvePersistCleanerIdForBooking } from "../lib/payout/bookingEarningsIntegrity";
import { persistCleanerPayoutIfUnset } from "../lib/payout/persistCleanerPayout";
import { resetBookingCleanerLineEarnings } from "../lib/payout/resetBookingCleanerLineEarnings";
import { logSystemEvent } from "../lib/logging/systemLog";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes("--dry-run");
const skipReset = process.argv.includes("--no-reset");
const skipAlreadyV3 = process.argv.includes("--skip-already-v3");
const singleBookingArgIdx = process.argv.indexOf("--booking");
const singleBookingId =
  singleBookingArgIdx > -1 && process.argv[singleBookingArgIdx + 1]
    ? process.argv[singleBookingArgIdx + 1]!.trim()
    : null;
const limitArgIdx = process.argv.indexOf("--limit");
const limit =
  limitArgIdx > -1 && process.argv[limitArgIdx + 1] ? Math.max(1, Number.parseInt(process.argv[limitArgIdx + 1]!, 10)) : null;

const TERMINAL_STATUSES = ["cancelled", "failed", "payment_expired"] as const;

type CandidateRow = {
  id: string;
  status: string | null;
  cleaner_id: string | null;
  payout_owner_cleaner_id: string | null;
  is_team_job: boolean | null;
  display_earnings_cents: number | null;
  earnings_model_version: string | null;
  service: string | null;
  date: string | null;
  time: string | null;
};

async function loadCandidates(admin: SupabaseClient): Promise<CandidateRow[]> {
  if (singleBookingId) {
    const { data, error } = await admin
      .from("bookings")
      .select(
        "id, status, cleaner_id, payout_owner_cleaner_id, is_team_job, display_earnings_cents, earnings_model_version, service, date, time",
      )
      .eq("id", singleBookingId)
      .maybeSingle();
    if (error || !data) return [];
    return [data as CandidateRow];
  }

  const out: CandidateRow[] = [];
  const pageSize = 500;
  let lastId = "";

  for (;;) {
    if (limit != null && out.length >= limit) break;

    let q = admin
      .from("bookings")
      .select(
        "id, status, cleaner_id, payout_owner_cleaner_id, is_team_job, display_earnings_cents, earnings_model_version, service, date, time",
      )
      .or("cleaner_id.not.is.null,payout_owner_cleaner_id.not.is.null")
      .not("status", "in", `(${TERMINAL_STATUSES.join(",")})`)
      .order("id", { ascending: true })
      .limit(Math.min(pageSize, limit != null ? limit - out.length : pageSize));
    if (lastId) q = q.gt("id", lastId);

    const { data, error } = await q;
    if (error) {
      console.error("[v3-recalc] candidate scan failed:", error.message);
      process.exit(1);
    }
    const batch = (data ?? []) as CandidateRow[];
    if (batch.length === 0) break;
    out.push(...batch);
    lastId = batch[batch.length - 1]!.id;
    if (batch.length < pageSize) break;
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
    `[v3-recalc] model=${CANONICAL_EARNINGS_MODEL_VERSION} candidates=${candidates.length}${dryRun ? " (DRY-RUN)" : ""}${skipReset ? " (no-reset)" : ""}`,
  );

  let attempted = 0;
  let recomputed = 0;
  let skipped = 0;
  let failed = 0;
  let resetBlocked = 0;
  const skippedReasons = new Map<string, number>();
  const changed: { id: string; before: number | null; after: number | null; version: string | null }[] = [];

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

    if (skipAlreadyV3 && row.earnings_model_version === CANONICAL_EARNINGS_MODEL_VERSION && row.display_earnings_cents != null) {
      skipped += 1;
      skippedReasons.set("already_v3", (skippedReasons.get("already_v3") ?? 0) + 1);
      continue;
    }

    attempted += 1;
    const tag = `${row.id}  ${row.date ?? "—"} ${row.time ?? "—"}  ${row.service ?? "—"}`;

    if (dryRun) {
      console.log(
        `[v3-recalc][dry] would recompute ${tag} display=${row.display_earnings_cents ?? "null"} model=${row.earnings_model_version ?? "null"}`,
      );
      continue;
    }

    try {
      const statusNorm = String(row.status ?? "").trim().toLowerCase();
      const isCompleted = statusNorm === "completed";

      if (!skipReset && !isCompleted) {
        const safe = await assertBookingCleanerEarningsResetSafe(admin, row.id);
        if (safe.ok) {
          const rst = await resetBookingCleanerLineEarnings(admin, row.id);
          if (!rst.ok) {
            console.warn(`[v3-recalc][warn] ${tag}: reset skipped — ${rst.error}; continuing with force persist`);
          }
        } else {
          resetBlocked += 1;
        }
      }

      const result = await persistCleanerPayoutIfUnset({
        admin,
        bookingId: row.id,
        cleanerId,
        forceDisplayRecompute: true,
      });

      if (!result.ok) {
        failed += 1;
        console.error(`[v3-recalc][fail] ${tag}: ${result.error ?? result.code ?? "unknown"}`);
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
        .select("display_earnings_cents, earnings_model_version")
        .eq("id", row.id)
        .maybeSingle();
      const afterRow = after as { display_earnings_cents?: number | null; earnings_model_version?: string | null } | null;
      const afterCents = afterRow?.display_earnings_cents ?? null;
      const afterVersion = afterRow?.earnings_model_version ?? null;

      recomputed += 1;
      changed.push({ id: row.id, before: row.display_earnings_cents, after: afterCents, version: afterVersion });
      console.log(
        `[v3-recalc][ok]  ${tag}: display ${row.display_earnings_cents ?? "null"} -> ${afterCents ?? "null"} model=${afterVersion ?? "null"}`,
      );

      void logSystemEvent({
        level: "info",
        source: "scripts/recalculate_all_cleaner_earnings_v3",
        message: "booking_earnings_recomputed_v3",
        context: {
          booking_id: row.id,
          cleaner_id: cleanerId,
          before_display_earnings_cents: row.display_earnings_cents,
          after_display_earnings_cents: afterCents,
          before_model_version: row.earnings_model_version,
          after_model_version: afterVersion,
          status: row.status,
        },
      });
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[v3-recalc][throw] ${tag}: ${msg}`);
    }
  }

  console.log(
    `[v3-recalc] done — attempted=${attempted} recomputed=${recomputed} skipped=${skipped} failed=${failed} reset_blocked=${resetBlocked}`,
  );
  if (skippedReasons.size > 0) {
    console.log("[v3-recalc] skip reasons:", Object.fromEntries(skippedReasons));
  }
  if (changed.length > 0 && changed.length <= 30) {
    console.log("[v3-recalc] changed bookings:");
    for (const c of changed) {
      console.log(`  ${c.id}: ${c.before ?? "null"} -> ${c.after ?? "null"} (${c.version ?? "null"})`);
    }
  } else if (changed.length > 30) {
    console.log(`[v3-recalc] ${changed.length} bookings changed (see logs above)`);
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[v3-recalc] fatal:", msg);
  process.exit(1);
});
