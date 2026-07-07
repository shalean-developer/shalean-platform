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

async function main() {
  const { data: cleaners } = await admin
    .from("cleaners")
    .select("id, full_name, email, status")
    .or("full_name.ilike.%Nyasha%,full_name.ilike.%Ethel%,full_name.ilike.%Lynne%");
  console.log("Cleaners:", cleaners);

  const { data: lynneBookings } = await admin
    .from("bookings")
    .select(
      "id, customer_name, customer_email, date, status, cleaner_id, selected_cleaner_id, team_id, is_team_job, recurring_id, cleaner_mode, cleaner_count, booking_cleaners(cleaner_id, role, full_name)",
    )
    .ilike("customer_name", "%Lynne Thorpe%")
    .order("date");

  console.log("\nLynne bookings count:", lynneBookings?.length);
  for (const b of lynneBookings ?? []) {
    console.log(JSON.stringify(b, null, 0));
  }

  await admin
    .from("recurring_bookings")
    .select("id, customer_id, frequency, status, preferred_cleaner_id, booking_snapshot_template")
    .limit(50);
  // find via bookings recurring_id
  const recurringIds = [...new Set((lynneBookings ?? []).map((b) => b.recurring_id).filter(Boolean))];
  if (recurringIds.length) {
    const { data: rp } = await admin.from("recurring_bookings").select("*").in("id", recurringIds);
    console.log("\nRecurring plans:", rp?.map((p) => ({ id: p.id, status: p.status, preferred: p.preferred_cleaner_id })));
  }

  const { data: mayLynne } = await admin
    .from("bookings")
    .select("id, date, cleaner_id, team_id, is_team_job, booking_cleaners(cleaner_id, role)")
    .ilike("customer_name", "%Lynne Thorpe%")
    .gte("date", "2026-05-01")
    .lte("date", "2026-05-31");
  console.log("\nMay Lynne:", mayLynne);
}

main();
