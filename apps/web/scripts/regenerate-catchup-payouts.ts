/**
 * Admin catch-up: rebuild weekly payout batches for all unlinked payable bookings.
 * Run: npx tsx --env-file=.env.local scripts/regenerate-catchup-payouts.ts
 */
import { createClient } from "@supabase/supabase-js";
import { withCronLock } from "@/lib/cron/cronLock";
import { CRON_LOCK_KEYS } from "@/lib/cron/cronLockKeys";
import { generateCatchUpWeeklyPayouts } from "@/lib/payout/generateWeeklyPayouts";
import {
  prepareDraftRunPayoutsForCatchUp,
  restoreDraftRunPayoutsAfterCatchUp,
} from "@/lib/payout/runs/reconcileDraftRunLateEarnings";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const lockResult = await withCronLock(
    admin,
    { jobName: CRON_LOCK_KEYS.generatePayouts, leaseSeconds: 900 },
    async () => {
      const prep = await prepareDraftRunPayoutsForCatchUp(admin);
      try {
        const generated = await generateCatchUpWeeklyPayouts(admin);
        return {
          ...generated,
          lateEarningsReconciledPayouts: prep.payouts.length,
          lateEarningsReconciledRuns: prep.runIds.length,
        };
      } finally {
        await restoreDraftRunPayoutsAfterCatchUp(admin, prep);
      }
    },
  );

  console.log(
    JSON.stringify(
      lockResult.skipped
        ? { ok: true, skipped: true, reason: lockResult.reason }
        : { ok: true, ...lockResult.ranIt },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
