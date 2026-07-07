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
  const { count: unassigned } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("is_recurring_generated", true)
    .is("cleaner_id", null)
    .neq("status", "cancelled");

  const { count: pendingAssignment } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("is_recurring_generated", true)
    .eq("status", "pending_assignment")
    .is("cleaner_id", null)
    .neq("status", "cancelled");

  const { data: sample } = await admin
    .from("bookings")
    .select("id, customer_name, date, status, cleaner_id, selected_cleaner_id, recurring_id, dispatch_status")
    .eq("is_recurring_generated", true)
    .is("cleaner_id", null)
    .neq("status", "cancelled")
    .order("date")
    .limit(15);

  console.log("Recurring without cleaner_id:", unassigned);
  console.log("Recurring pending_assignment without cleaner_id:", pendingAssignment);
  console.log("\nSample:");
  for (const b of sample ?? []) {
    console.log(
      `${b.customer_name?.slice(0, 20)} ${b.date} status=${b.status} selected=${b.selected_cleaner_id?.slice(0, 8) ?? "null"} recurring=${b.recurring_id?.slice(0, 8)}`,
    );
  }

  const { data: plans } = await admin
    .from("recurring_bookings")
    .select("id, preferred_cleaner_id, status")
    .eq("status", "active");
  const withPref = (plans ?? []).filter((p) => p.preferred_cleaner_id).length;
  console.log(`\nActive plans: ${plans?.length ?? 0}, with preferred_cleaner_id: ${withPref}`);
}

main().catch(console.error);
