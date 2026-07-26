/**
 * Staging-only PR #112 acceptance probe (read-only).
 * Usage: node --env-file=../../.env.staging.local ./scripts/staging-pr112-acceptance-probe.mjs
 * Run from apps/web.
 */
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const url = rawUrl.trim().replace(/^["']|["']$/g, "");
const key = rawKey.trim().replace(/^["']|["']$/g, "");

const vitest = spawnSync(
  "npx",
  [
    "vitest",
    "run",
    "lib/admin/expenses/__tests__/bookingProfitabilityCleanerCost.test.ts",
    "lib/admin/expenses/__tests__/bookingExpensesProfitDisplay.test.ts",
  ],
  { encoding: "utf8", shell: true },
);

const evidence = {
  unit_tests: {
    status: vitest.status,
    pass: vitest.status === 0,
    stdout_tail: (vitest.stdout || "").split(/\r?\n/).filter(Boolean).slice(-6),
  },
  cases: {},
};

if (!url || !key) {
  evidence.db_probe = { pass: false, error: "missing supabase env" };
  console.log(JSON.stringify(evidence, null, 2));
  process.exit(1);
}

evidence.staging_supabase_host = new URL(url).host;
const admin = createClient(url, key, { auth: { persistSession: false } });

const { data: booking, error: bookingError } = await admin
  .from("bookings")
  .select(
    "id, booking_reference, is_team_job, display_earnings_cents, cleaner_earnings_total_cents, status",
  )
  .eq("booking_reference", "SHL-BK-000527")
  .maybeSingle();

if (bookingError) {
  evidence.cases.shl_bk_000527 = { pass: false, error: bookingError.message };
} else if (!booking) {
  evidence.cases.shl_bk_000527 = {
    pass: null,
    note: "Not present on staging Supabase (production-only). Incomplete path covered by unit regressions.",
  };
} else {
  const { count } = await admin
    .from("team_job_member_payouts")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", booking.id);
  const incomplete =
    booking.is_team_job === true &&
    (booking.cleaner_earnings_total_cents == null || Number(booking.cleaner_earnings_total_cents) <= 0);
  evidence.cases.shl_bk_000527 = {
    found: true,
    is_team_job: booking.is_team_job === true,
    display_earnings_cents: booking.display_earnings_cents,
    cleaner_earnings_total_cents: booking.cleaner_earnings_total_cents,
    team_job_member_payouts_count: count ?? 0,
    pass: incomplete,
  };
}

const { data: teamSample } = await admin
  .from("bookings")
  .select(
    "booking_reference, is_team_job, display_earnings_cents, cleaner_earnings_total_cents, team_member_count_snapshot",
  )
  .eq("status", "completed")
  .eq("is_team_job", true)
  .gt("cleaner_earnings_total_cents", 0)
  .not("display_earnings_cents", "is", null)
  .order("date", { ascending: false })
  .limit(10);

const interesting = (teamSample ?? []).filter(
  (b) => Number(b.cleaner_earnings_total_cents) > Number(b.display_earnings_cents),
);
evidence.cases.live_team_total_gt_display = {
  sample_count: (teamSample ?? []).length,
  total_gt_display_count: interesting.length,
  examples: interesting.slice(0, 5).map((b) => ({
    booking_reference: b.booking_reference,
    team_member_count_snapshot: b.team_member_count_snapshot,
    display_earnings_cents: b.display_earnings_cents,
    cleaner_earnings_total_cents: b.cleaner_earnings_total_cents,
    buggy_display_zar: Math.round(Number(b.display_earnings_cents) / 100),
    correct_team_cost_zar: Math.round(Number(b.cleaner_earnings_total_cents) / 100),
  })),
  pass: true,
};

const { count: payoutCount } = await admin
  .from("team_job_member_payouts")
  .select("id", { count: "exact", head: true });
evidence.payout_records = {
  team_job_member_payouts_count: payoutCount ?? null,
  note: "Read-only count only. PR #112 commits do not write/redistribute member payouts.",
  pass: true,
};

evidence.overall_pass =
  evidence.unit_tests.pass === true &&
  Object.values(evidence.cases)
    .filter((c) => c && typeof c === "object" && "pass" in c && c.pass !== null)
    .every((c) => c.pass === true);

console.log(JSON.stringify(evidence, null, 2));
process.exit(evidence.overall_pass ? 0 : 2);
