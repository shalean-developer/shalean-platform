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

const LUCIA_ID = "72642f1a-4745-47e1-9a13-1edbb19b20d0";
const JARED_PLAN_ID = "938ef56b-e965-4065-b55a-e01a0947201f";
const JARED_EMAIL = "channingpeace@gmail.com";

function assignPatch(status) {
  const st = String(status ?? "").toLowerCase();
  const now = new Date().toISOString();
  if (st === "pending") {
    return {
      selected_cleaner_id: LUCIA_ID,
      cleaner_id: LUCIA_ID,
      assignment_type: "user_selected",
      status: "assigned",
      assigned_at: now,
      cleaner_response_status: "pending",
      dispatch_status: "assigned",
    };
  }
  return {
    selected_cleaner_id: LUCIA_ID,
    assignment_type: "user_selected",
  };
}

async function lastCleanerForPlan(recurringId) {
  const { data } = await admin
    .from("bookings")
    .select("cleaner_id, selected_cleaner_id, date")
    .eq("recurring_id", recurringId)
    .neq("status", "cancelled")
    .order("date", { ascending: false })
    .limit(20);
  for (const row of data ?? []) {
    if (row.cleaner_id) return row.cleaner_id;
    if (row.selected_cleaner_id) return row.selected_cleaner_id;
  }
  return null;
}

function genericAssignPatch(cleanerId, status) {
  const st = String(status ?? "").toLowerCase();
  const now = new Date().toISOString();
  if (st === "pending") {
    return {
      selected_cleaner_id: cleanerId,
      cleaner_id: cleanerId,
      assignment_type: "user_selected",
      status: "assigned",
      assigned_at: now,
      cleaner_response_status: "pending",
      dispatch_status: "assigned",
    };
  }
  return {
    selected_cleaner_id: cleanerId,
    assignment_type: "user_selected",
  };
}

async function main() {
  // Jared Peace → Lucia Chiuta on plan + all unassigned June visits
  const { data: jaredRows } = await admin
    .from("bookings")
    .select("id, status")
    .eq("recurring_id", JARED_PLAN_ID)
    .eq("is_recurring_generated", true)
    .gte("date", "2026-06-01")
    .is("cleaner_id", null)
    .is("selected_cleaner_id", null);

  let jaredUpdated = 0;
  for (const row of jaredRows ?? []) {
    const { error } = await admin.from("bookings").update(assignPatch(row.status)).eq("id", row.id);
    if (error) console.error("Jared booking", row.id, error.message);
    else jaredUpdated++;
  }

  const { error: planErr } = await admin
    .from("recurring_bookings")
    .update({ preferred_cleaner_id: LUCIA_ID })
    .eq("id", JARED_PLAN_ID);
  if (planErr) console.error("Jared plan preferred_cleaner_id:", planErr.message);

  console.log(`Jared Peace: assigned Lucia to ${jaredUpdated} booking(s); plan preferred_cleaner_id set.`);

  // Other unassigned June recurring — reuse last cleaner on each plan
  const { data: remaining } = await admin
    .from("bookings")
    .select("id, status, recurring_id, customer_name")
    .eq("is_recurring_generated", true)
    .gte("date", "2026-06-01")
    .is("cleaner_id", null)
    .is("selected_cleaner_id", null)
    .neq("recurring_id", JARED_PLAN_ID);

  const planCache = new Map();
  let otherUpdated = 0;
  let otherSkipped = 0;

  for (const row of remaining ?? []) {
    const rid = row.recurring_id;
    if (!rid) {
      otherSkipped++;
      continue;
    }
    let cleanerId = planCache.get(rid);
    if (cleanerId === undefined) {
      cleanerId = await lastCleanerForPlan(rid);
      planCache.set(rid, cleanerId);
      if (cleanerId) {
        await admin.from("recurring_bookings").update({ preferred_cleaner_id: cleanerId }).eq("id", rid);
      }
    }
    if (!cleanerId) {
      console.log(`No prior cleaner for plan ${rid} (${row.customer_name}) — skipped`);
      otherSkipped++;
      continue;
    }
    const { error } = await admin.from("bookings").update(genericAssignPatch(cleanerId, row.status)).eq("id", row.id);
    if (error) console.error(row.id, error.message);
    else otherUpdated++;
  }

  console.log(`Other customers: assigned ${otherUpdated}, skipped ${otherSkipped}.`);

  const { count } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("is_recurring_generated", true)
    .gte("date", "2026-06-01")
    .is("cleaner_id", null)
    .is("selected_cleaner_id", null);
  console.log(`Remaining unassigned June recurring: ${count ?? 0}`);
}

main();
