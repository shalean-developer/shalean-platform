/**
 * Reconcile team_daily_capacity_usage with actual team bookings on a date.
 * Fixes stale slots left when assign failed after claim_team_capacity_slot.
 *
 * Usage: npx tsx --env-file=.env.local scripts/reconcileTeamCapacity.ts --date=2026-05-27 [--execute]
 */
import { getSupabaseAdmin } from "../lib/supabase/admin";

const EXECUTE = process.argv.includes("--execute");
const dateArg = process.argv.find((a) => a.startsWith("--date="));
const dateYmd = dateArg?.slice("--date=".length) ?? "";

async function main() {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
    console.error("Pass --date=YYYY-MM-DD");
    process.exit(1);
  }
  const admin = getSupabaseAdmin();
  if (!admin) process.exit(1);

  const { data: bookings, error: bErr } = await admin
    .from("bookings")
    .select("team_id")
    .eq("date", dateYmd)
    .eq("is_team_job", true)
    .in("status", ["pending", "assigned", "in_progress"])
    .not("team_id", "is", null);
  if (bErr) {
    console.error(bErr.message);
    process.exit(1);
  }

  const expected = new Map<string, number>();
  for (const row of bookings ?? []) {
    const tid = String((row as { team_id?: string | null }).team_id ?? "").trim();
    if (!tid) continue;
    expected.set(tid, (expected.get(tid) ?? 0) + 1);
  }

  const { data: usageRows, error: uErr } = await admin
    .from("team_daily_capacity_usage")
    .select("team_id, used_slots, teams(name)")
    .eq("booking_date", dateYmd);
  if (uErr) {
    console.error(uErr.message);
    process.exit(1);
  }

  console.log(EXECUTE ? "=== EXECUTE ===" : "=== DRY RUN ===", dateYmd);
  let adjusted = 0;
  for (const row of usageRows ?? []) {
    const tid = String((row as { team_id?: string }).team_id ?? "").trim();
    const current = Math.max(0, Math.floor(Number((row as { used_slots?: number }).used_slots ?? 0)));
    const want = expected.get(tid) ?? 0;
    const name = (row as { teams?: { name?: string } | null }).teams?.name ?? tid.slice(0, 8);
    if (current === want) continue;
    console.log(`  ${name}: used_slots ${current} → ${want}`);
    adjusted += 1;
    if (EXECUTE) {
      if (want === 0) {
        await admin.from("team_daily_capacity_usage").delete().eq("team_id", tid).eq("booking_date", dateYmd);
      } else {
        await admin
          .from("team_daily_capacity_usage")
          .update({ used_slots: want })
          .eq("team_id", tid)
          .eq("booking_date", dateYmd);
      }
    }
  }

  console.log(`\nDone. ${adjusted} row(s) ${EXECUTE ? "updated" : "would update"}.`);
  if (!EXECUTE && adjusted > 0) console.log("Re-run with --execute to apply.");
}

main();
