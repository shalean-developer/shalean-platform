/**
 * Recompute cleaner earnings for all assigned bookings using the v3 canonical engine
 * (`persistCleanerPayoutIfUnset({ forceDisplayRecompute: true })`).
 *
 * Completed solo jobs with finalized line earnings are reset first when safe (same gate as
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
 *   npm run recalculate:cleaner-earnings-v3 -- --from 2026-07-01 --to 2026-07-31
 *   npm run recalculate:cleaner-earnings-v3 -- --limit 50
 *   npm run recalculate:cleaner-earnings-v3 -- --skip-already-v3  # skip rows already on v3
 */

import { createClient } from "@supabase/supabase-js";
import { CANONICAL_EARNINGS_MODEL_VERSION } from "../lib/payout/canonicalCleanerPayout";
import { recalculateCleanerEarningsBatch } from "../lib/payout/recalculateCleanerEarningsBatch";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes("--dry-run");
const skipReset = process.argv.includes("--no-reset");
const skipAlreadyV3 = process.argv.includes("--skip-already-v3");

function readArg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx > -1 && process.argv[idx + 1]) return process.argv[idx + 1]!.trim();
  return null;
}

const singleBookingId = readArg("--booking");
const from = readArg("--from");
const to = readArg("--to");
const limitRaw = readArg("--limit");
const limit = limitRaw ? Math.max(1, Number.parseInt(limitRaw, 10)) : null;

async function main(): Promise<void> {
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });

  const result = await recalculateCleanerEarningsBatch({
    admin,
    from,
    to,
    bookingId: singleBookingId,
    limit,
    dryRun,
    skipReset,
    skipAlreadyV3,
    logSource: "scripts/recalculate_all_cleaner_earnings_v3",
  });

  console.log(
    `[v3-recalc] model=${CANONICAL_EARNINGS_MODEL_VERSION} candidates=${result.candidates}${dryRun ? " (DRY-RUN)" : ""}${skipReset ? " (no-reset)" : ""}`,
  );

  if (dryRun) {
    console.log(`[v3-recalc][dry] would attempt ${result.attempted} bookings in range`);
  } else {
    for (const c of result.changed) {
      console.log(
        `[v3-recalc][ok]  ${c.id}: display ${c.before ?? "null"} -> ${c.after ?? "null"} model=${c.version ?? "null"}`,
      );
    }
  }

  console.log(
    `[v3-recalc] done — attempted=${result.attempted} recomputed=${result.recomputed} skipped=${result.skipped} failed=${result.failed} reset_blocked=${result.resetBlocked}`,
  );
  if (Object.keys(result.skipReasons).length > 0) {
    console.log("[v3-recalc] skip reasons:", result.skipReasons);
  }
  if (result.changed.length > 30) {
    console.log(`[v3-recalc] ${result.changed.length} bookings changed`);
  }

  if (!result.ok) process.exit(1);
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[v3-recalc] fatal:", msg);
  process.exit(1);
});
