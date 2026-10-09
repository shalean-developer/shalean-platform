/**
 * Admin catch-up: rebuild weekly payout batches for all unlinked payable bookings.
 * Run: npx tsx --env-file=.env.local scripts/regenerate-catchup-payouts.ts
 */
import { createClient } from "@supabase/supabase-js";
import { withCronLock } from "@/lib/cron/cronLock";
import { CRON_LOCK_KEYS } from "@/lib/cron/cronLockKeys";
import { generateCatchUpWeeklyPayouts } from "@/lib/payout/generateWeeklyPayouts";

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
      // Standalone CLI intentionally does not reopen frozen draft-run payouts:
      // an abrupt process exit could strand them detached from their run.
      // Governed cron/admin routes own reopen/restore because their lifecycle is
      // observable and protected by the renewable payout-generation lease.
      return generateCatchUpWeeklyPayouts(admin);
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
