/**
 * July 2026 cleaner-earnings reconciliation — production/staging precheck (read-only).
 *
 * Usage:
 *   cd apps/web
 *   npx tsx --env-file=.env.local scripts/julyEarningsReconciliationPrecheck.ts
 *
 * Refuses non-staging unless ALLOW_PROD_PRECHECK=1 (still read-only).
 */
import { createClient } from "@supabase/supabase-js";

const PROD_REF = "tchayecuvzssixyxlvfu";
const STAGING_REF = "gbgnemlpyykyhpqqbgru";

const LYNNE_IDS = [
  "6b580f19-0305-4602-8ce2-ac0dad4c9ac1",
  "faf965c6-4916-4598-be14-cf541f22bf70",
  "ce575148-a048-41e6-828e-c5354132adf9",
] as const;

const MAGARET = "2ba4ac8f-f271-4ce3-9811-58dbca218dc1";
const LUCIA = "72642f1a-4745-47e1-9a13-1edbb19b20d0";
const ETHEL = "914b3acf-40e8-4ad5-a5a2-9e2de711849a";
const NYASHA = "796e3ad7-07f3-44eb-b4cf-bed439a59f8b";
const LORRAINE = "015e91e8-df25-4fde-8db1-a5901b005ae3";

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").trim();
if (!url || !key) {
  console.error("Missing Supabase URL / service role key");
  process.exit(2);
}

const isProd = url.includes(PROD_REF);
const isStaging = url.includes(STAGING_REF);
if (isProd && process.env.ALLOW_PROD_PRECHECK !== "1") {
  console.error("Refusing production precheck without ALLOW_PROD_PRECHECK=1 (read-only).");
  process.exit(2);
}
if (!isProd && !isStaging) {
  console.error(`Unexpected Supabase host: ${url}`);
  process.exit(2);
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function main() {
  const { data: lynne, error: lynneErr } = await admin
    .from("bookings")
    .select(
      "id, booking_reference, date, status, completed_at, payment_status, cleaner_id, payout_owner_cleaner_id, display_earnings_cents, cleaner_earnings_total_cents, earnings_summary, recurring_id",
    )
    .in("id", [...LYNNE_IDS]);
  if (lynneErr) throw lynneErr;

  const { data: refs } = await admin
    .from("bookings")
    .select(
      "id, booking_reference, date, status, completed_at, payment_status, cleaner_id, payout_owner_cleaner_id, display_earnings_cents, earnings_summary",
    )
    .in("booking_reference", ["SHL-BK-000359", "SHL-BK-000360", "SHL-BK-000540"]);

  const bookingIds = [...(lynne ?? []), ...(refs ?? [])].map((b) => b.id);
  const { data: snaps } = await admin
    .from("booking_cleaner_earnings_snapshot")
    .select("booking_id, cleaner_id, display_earnings_cents, payout_earnings_cents")
    .in("booking_id", bookingIds);

  const { data: roster } = await admin
    .from("booking_cleaners")
    .select("booking_id, cleaner_id, role, completed_at")
    .in("booking_id", bookingIds);

  const evidence = {
    at: new Date().toISOString(),
    host: url,
    env: isProd ? "production" : "staging",
    read_only: true,
    lynne,
    refs,
    snaps,
    roster,
    checks: {
      lynne_assigned_with_completed_at: (lynne ?? []).filter(
        (b) => String(b.status).toLowerCase() === "assigned" && Boolean(b.completed_at),
      ).length,
      magaret_on_359_360_snapshots: (snaps ?? []).filter((s) => s.cleaner_id === MAGARET).length,
      lucia_id: LUCIA,
      ethel_id: ETHEL,
      nyasha_id: NYASHA,
      lorraine_id: LORRAINE,
    },
  };

  console.log(JSON.stringify(evidence, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
