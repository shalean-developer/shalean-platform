import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const sb = createClient(url, key);

async function main() {
  const { data: cleaners, error: cErr } = await sb
    .from("cleaners")
    .select("id, full_name, is_available, status, rating, jobs_completed")
    .ilike("full_name", "%princess%")
    .limit(5);
  if (cErr) throw cErr;
  console.log("CLEANERS", JSON.stringify(cleaners, null, 2));

  const cleanerId = cleaners?.[0]?.id;
  if (!cleanerId) return;

  const { data: bookings, error: bErr } = await sb
    .from("bookings")
    .select(
      "id, date, time, location, suburb, status, display_earnings_cents, cleaner_earnings_total_cents, payout_frozen_cents, base_amount_cents, service_fee_cents, total_paid_zar, amount_paid_cents, payment_status, assigned_at, started_at, cleaner_id",
    )
    .eq("cleaner_id", cleanerId)
    .not("status", "eq", "cancelled")
    .not("status", "eq", "failed")
    .order("date", { ascending: true })
    .limit(20);
  if (bErr) throw bErr;
  console.log("BOOKINGS", JSON.stringify(bookings, null, 2));

  const bid = "1e2929c6-61ef-497b-ace9-0b3242a65dbb";
  const { data: known } = await sb
    .from("bookings")
    .select(
      "id, date, time, location, suburb, status, display_earnings_cents, base_amount_cents, service_fee_cents, total_paid_zar, amount_paid_cents, payment_status, cleaner_id, price_snapshot",
    )
    .eq("id", bid)
    .maybeSingle();
  console.log("KNOWN_BOOKING", JSON.stringify(known, null, 2));

  const [{ data: owner }, { data: roster }] = await Promise.all([
    sb.from("cleaners").select("id, full_name, user_id").eq("id", "015e91e8-df25-4fde-8db1-a5901b005ae3").maybeSingle(),
    sb.from("booking_cleaners").select("cleaner_id, role").eq("booking_id", bid),
  ]);
  console.log("IN_PROGRESS_OWNER", JSON.stringify(owner, null, 2));
  console.log("IN_PROGRESS_ROSTER", JSON.stringify(roster, null, 2));

  const { data: teamFlags } = await sb
    .from("bookings")
    .select("is_team_job, team_id, payout_owner_cleaner_id, service")
    .eq("id", bid)
    .maybeSingle();
  console.log("IN_PROGRESS_FLAGS", JSON.stringify(teamFlags, null, 2));

  const teamId = teamFlags?.team_id;
  if (teamId) {
    const { data: teamMembers } = await sb.from("team_members").select("*").eq("team_id", teamId);
    console.log("TEAM_MEMBERS", JSON.stringify(teamMembers, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
