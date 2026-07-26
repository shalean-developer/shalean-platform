/**
 * Read-only probe for SHL-BK-000527 team payout completeness.
 *
 * Usage (from apps/web, with service-role env):
 *   node --env-file=.env.local ./scripts/investigate-shl-bk-000527.mjs
 *
 * Does not write or redistribute payouts.
 */
import { createClient } from "@supabase/supabase-js";

const ref = process.argv[2] ?? "SHL-BK-000527";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

const { data: booking, error: bookingError } = await admin
  .from("bookings")
  .select(
    "id, booking_reference, date, status, is_team_job, team_id, team_member_count_snapshot, cleaner_id, payout_owner_cleaner_id, display_earnings_cents, cleaner_payout_cents, cleaner_earnings_total_cents, cleaner_line_earnings_finalized_at",
  )
  .eq("booking_reference", ref)
  .maybeSingle();

if (bookingError) {
  console.error("booking query failed", bookingError.message);
  process.exit(1);
}
if (!booking) {
  console.error(`No booking found for ${ref}`);
  process.exit(2);
}

const { data: payouts, error: payoutError } = await admin
  .from("team_job_member_payouts")
  .select("id, cleaner_id, team_id, payout_cents, created_at")
  .eq("booking_id", booking.id);

if (payoutError) {
  console.error("team_job_member_payouts query failed", payoutError.message);
  process.exit(1);
}

const payoutRows = payouts ?? [];
const payoutSum = payoutRows.reduce((s, r) => s + Number(r.payout_cents || 0), 0);

const report = {
  booking_reference: booking.booking_reference,
  booking_id: booking.id,
  date: booking.date,
  status: booking.status,
  is_team_job: booking.is_team_job === true,
  team_id: booking.team_id,
  team_member_count_snapshot: booking.team_member_count_snapshot,
  display_earnings_cents: booking.display_earnings_cents,
  cleaner_earnings_total_cents: booking.cleaner_earnings_total_cents,
  team_job_member_payouts_count: payoutRows.length,
  team_job_member_payouts_sum_cents: payoutSum,
  authoritative_team_payouts_present: payoutRows.length > 0,
  profitability_should_warn_incomplete:
    booking.is_team_job === true && booking.cleaner_earnings_total_cents == null,
  note: "Do not redistribute individual cleaner payouts from this probe.",
};

console.log(JSON.stringify(report, null, 2));
