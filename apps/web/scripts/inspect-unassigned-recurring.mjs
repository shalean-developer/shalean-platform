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
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[k] = v;
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  const { data: cleaners } = await admin.from("cleaners").select("id, full_name, email, status").ilike("full_name", "%Lucia%");
  console.log("Lucia cleaners:", cleaners);

  const { data: jaredBookings } = await admin
    .from("bookings")
    .select("id, customer_name, customer_email, date, status, cleaner_id, selected_cleaner_id, recurring_id, is_recurring_generated")
    .or("customer_name.ilike.%Jared Peace%,customer_email.ilike.%jared%")
    .eq("is_recurring_generated", true)
    .gte("date", "2026-06-01")
    .order("date");

  console.log("\nJared recurring June bookings:", jaredBookings?.length);
  for (const b of jaredBookings ?? []) console.log(b);

  const { data: unassigned } = await admin
    .from("bookings")
    .select("id, customer_name, customer_email, date, status, cleaner_id, selected_cleaner_id, recurring_id")
    .eq("is_recurring_generated", true)
    .gte("date", "2026-06-01")
    .is("cleaner_id", null)
    .is("selected_cleaner_id", null)
    .order("customer_name")
    .order("date");

  console.log("\nAll unassigned June recurring:", unassigned?.length);
  const byCustomer = {};
  for (const b of unassigned ?? []) {
    const k = b.customer_name || b.customer_email || "?";
    byCustomer[k] = (byCustomer[k] ?? 0) + 1;
  }
  console.log("By customer:", byCustomer);
}

main();
