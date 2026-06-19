/**
 * Admin catch-up: rebuild weekly payout batches for all unlinked payable bookings.
 * Run: npx tsx --env-file=.env.local scripts/regenerate-catchup-payouts.ts
 */
import { createClient } from "@supabase/supabase-js";
import { generateCatchUpWeeklyPayouts } from "@/lib/payout/generateWeeklyPayouts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const result = await generateCatchUpWeeklyPayouts(admin);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
