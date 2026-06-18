import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(resolve(__dir, "../.env.local"), "utf8");
for (const line of raw.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const LYNNE_PLAN_ID = "a053ea81-185e-4434-9851-9619ee79f1a2";
const NYASHA_ID = "796e3ad7-07f3-44eb-b4cf-bed439a59f8b";
const ETHEL_ID = "914b3acf-40e8-4ad5-a5a2-9e2de711849a";

const ROSTER_ROWS = [
  { cleaner_id: NYASHA_ID, role: "lead", payout_weight: 1, lead_bonus_cents: 0, source: "admin_recurring_fix" },
  { cleaner_id: ETHEL_ID, role: "member", payout_weight: 1, lead_bonus_cents: 0, source: "admin_recurring_fix" },
];

async function main() {
  const { data: bookings } = await admin
    .from("bookings")
    .select("id, date, status, cleaner_line_earnings_finalized_at")
    .eq("recurring_id", LYNNE_PLAN_ID)
    .eq("is_recurring_generated", true)
    .order("date");

  let updated = 0;
  let skipped = 0;

  for (const b of bookings ?? []) {
    if (b.cleaner_line_earnings_finalized_at) {
      console.log(`Skip finalized ${b.date} ${b.id}`);
      skipped++;
      continue;
    }
    if (String(b.status).toLowerCase() === "cancelled") {
      skipped++;
      continue;
    }

    const { error: rpcErr } = await admin.rpc("replace_booking_cleaners_admin_atomic", {
      p_booking_id: b.id,
      p_rows: ROSTER_ROWS,
    });
    if (rpcErr) {
      console.error(`Roster failed ${b.date} ${b.id}:`, rpcErr.message);
      skipped++;
      continue;
    }

    const now = new Date().toISOString();
    const { error: patchErr } = await admin
      .from("bookings")
      .update({
        cleaner_id: NYASHA_ID,
        selected_cleaner_id: NYASHA_ID,
        payout_owner_cleaner_id: NYASHA_ID,
        cleaner_mode: "individual_cleaners",
        cleaner_count: 2,
        assignment_type: "admin_assigned",
        status: ["pending"].includes(String(b.status).toLowerCase()) ? "assigned" : b.status,
        assigned_at: now,
        cleaner_response_status: "pending",
        dispatch_status: "assigned",
        is_team_job: false,
        team_id: null,
      })
      .eq("id", b.id);

    if (patchErr) {
      console.error(`Booking patch failed ${b.date}:`, patchErr.message);
      skipped++;
      continue;
    }

    console.log(`OK ${b.date} (${b.status})`);
    updated++;
  }

  // preferred_cleaner_id only holds one — use Nyasha as lead; roster carries both
  await admin.from("recurring_bookings").update({ preferred_cleaner_id: NYASHA_ID }).eq("id", LYNNE_PLAN_ID);

  const { data: verify } = await admin
    .from("bookings")
    .select("date, cleaner_count, booking_cleaners(cleaner_id, role, cleaners(full_name))")
    .eq("recurring_id", LYNNE_PLAN_ID)
    .gte("date", "2026-06-01")
    .limit(2);

  console.log(`\nUpdated ${updated}, skipped ${skipped}`);
  console.log("June sample:", JSON.stringify(verify, null, 2));
}

main();
