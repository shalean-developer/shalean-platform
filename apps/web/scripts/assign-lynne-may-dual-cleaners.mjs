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

const PLAN_ID = "a053ea81-185e-4434-9851-9619ee79f1a2";
const NYASHA_ID = "796e3ad7-07f3-44eb-b4cf-bed439a59f8b";
const ETHEL_ID = "914b3acf-40e8-4ad5-a5a2-9e2de711849a";

async function assignDualRoster(bookingId, date, status) {
  await admin.from("booking_cleaners").delete().eq("booking_id", bookingId);

  const { error: e1 } = await admin.from("booking_cleaners").insert({
    booking_id: bookingId,
    cleaner_id: NYASHA_ID,
    role: "lead",
    source: "admin_recurring_fix",
  });
  if (e1) throw new Error(`${date} lead insert: ${e1.message}`);

  const { error: e2 } = await admin.from("booking_cleaners").insert({
    booking_id: bookingId,
    cleaner_id: ETHEL_ID,
    role: "member",
    source: "admin_recurring_fix",
  });
  if (e2) throw new Error(`${date} member insert: ${e2.message}`);

  const { error: patchErr } = await admin
    .from("bookings")
    .update({
      cleaner_id: NYASHA_ID,
      selected_cleaner_id: NYASHA_ID,
      payout_owner_cleaner_id: NYASHA_ID,
      cleaner_mode: "individual_cleaners",
      cleaner_count: 2,
      assignment_type: "admin_assigned",
      dispatch_status: "assigned",
      is_team_job: false,
      team_id: null,
    })
    .eq("id", bookingId);

  if (patchErr) throw new Error(`${date} booking patch: ${patchErr.message}`);
}

async function main() {
  const { data: bookings } = await admin
    .from("bookings")
    .select("id, date, status")
    .eq("recurring_id", PLAN_ID)
    .eq("is_recurring_generated", true)
    .gte("date", "2026-05-01")
    .lte("date", "2026-05-31")
    .order("date");

  if (!bookings?.length) {
    console.log("No May bookings found.");
    return;
  }

  for (const b of bookings) {
    await assignDualRoster(b.id, b.date, b.status);
    console.log(`OK ${b.date} (${b.status}) — Nyasha (lead) + Ethel (member)`);
  }

  const { data: verify } = await admin
    .from("bookings")
    .select("date, cleaner_count, booking_cleaners(role, cleaners(full_name))")
    .eq("recurring_id", PLAN_ID)
    .gte("date", "2026-05-01")
    .lte("date", "2026-05-31")
    .order("date")
    .limit(2);

  console.log("\nSample:", JSON.stringify(verify, null, 2));
  console.log(`\nDone — ${bookings.length} May booking(s) updated.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
