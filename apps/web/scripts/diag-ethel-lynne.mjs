import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(resolve(__dir, "../.env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!process.env[k]) process.env[k] = v;
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: cleaners } = await admin
  .from("cleaners")
  .select("id, full_name")
  .or("full_name.ilike.%Ethel%,full_name.ilike.%Nyasha%");

console.log("Cleaners:", cleaners);

const ethel = "914b3acf-40e8-4ad5-a5a2-9e2de711849a";
const nyasha = "796e3ad7-07f3-44eb-b4cf-bed439a59f8b";

const { data: roster } = await admin
  .from("booking_cleaners")
  .select("booking_id, cleaner_id, role")
  .in("cleaner_id", [ethel, nyasha])
  .limit(100);

const ids = [...new Set((roster ?? []).map((r) => r.booking_id))];
console.log("\nRoster booking ids:", ids.length);

if (ids.length) {
  const { data: bks } = await admin
    .from("bookings")
    .select("id, date, location, status, payout_status, cleaner_id, is_team_job, earnings_summary")
    .in("id", ids)
    .gte("date", "2026-06-01")
    .order("date");
  for (const b of bks ?? []) {
    const r = (roster ?? []).filter((x) => x.booking_id === b.id);
    console.log({
      date: b.date,
      status: b.status,
      payout: b.payout_status,
      loc: b.location?.slice(0, 60),
      cleaner: b.cleaner_id?.slice(0, 8),
      team: b.is_team_job,
      roster: r.map((x) => `${x.cleaner_id.slice(0, 8)}:${x.role}`),
      per: b.earnings_summary?.per_cleaner_earnings?.map((p) => `${p.cleaner_id.slice(0, 8)}:${p.total_cents}`),
    });
  }
}

const { data: loc } = await admin
  .from("bookings")
  .select("id, date, location, status, cleaner_id")
  .ilike("location", "%Lynn%")
  .gte("date", "2026-06-01")
  .limit(20);
console.log("\nLynn* locations:", loc);

