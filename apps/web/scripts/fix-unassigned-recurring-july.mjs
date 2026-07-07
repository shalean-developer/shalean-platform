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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const monthArg = process.argv[2]?.trim() || "2026-07";
const monthStart = `${monthArg}-01`;
const monthEnd = new Date(Number(monthArg.slice(0, 4)), Number(monthArg.slice(5, 7)), 0)
  .toISOString()
  .slice(0, 10);

function restoreAssignedPatch(cleanerId) {
  const now = new Date().toISOString();
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

async function lastCleanerForPlan(recurringId) {
  const { data } = await admin
    .from("bookings")
    .select("cleaner_id, selected_cleaner_id, date")
    .eq("recurring_id", recurringId)
    .neq("status", "cancelled")
    .lt("date", monthStart)
    .order("date", { ascending: false })
    .limit(20);
  for (const row of data ?? []) {
    const c = row.cleaner_id && UUID_RE.test(String(row.cleaner_id)) ? String(row.cleaner_id) : null;
    if (c) return c;
    const s =
      row.selected_cleaner_id && UUID_RE.test(String(row.selected_cleaner_id))
        ? String(row.selected_cleaner_id)
        : null;
    if (s) return s;
  }
  return null;
}

async function main() {
  console.log(`Restoring cleaner assignments for recurring bookings in ${monthArg}…`);

  const { data: stuckRows } = await admin
    .from("bookings")
    .select("id, recurring_id, selected_cleaner_id, customer_name, status")
    .eq("is_recurring_generated", true)
    .gte("date", monthStart)
    .lte("date", monthEnd)
    .eq("status", "pending_assignment")
    .is("cleaner_id", null)
    .not("selected_cleaner_id", "is", null)
    .neq("status", "cancelled");

  let updated = 0;
  let skipped = 0;
  const planCleaner = new Map();

  for (const row of stuckRows ?? []) {
    const cleanerId = row.selected_cleaner_id && UUID_RE.test(String(row.selected_cleaner_id))
      ? String(row.selected_cleaner_id)
      : null;
    if (!cleanerId) {
      skipped++;
      continue;
    }

    const { error } = await admin.from("bookings").update(restoreAssignedPatch(cleanerId)).eq("id", row.id);
    if (error) {
      console.error(`Failed ${row.id} (${row.customer_name}):`, error.message);
      skipped++;
      continue;
    }
    updated++;

    if (row.recurring_id && !planCleaner.has(row.recurring_id)) {
      planCleaner.set(row.recurring_id, cleanerId);
    }
  }

  let plansUpdated = 0;
  for (const [planId, cleanerId] of planCleaner) {
    const { error } = await admin
      .from("recurring_bookings")
      .update({ preferred_cleaner_id: cleanerId })
      .eq("id", planId)
      .is("preferred_cleaner_id", null);
    if (error) console.error(`Plan ${planId} preferred_cleaner_id:`, error.message);
    else plansUpdated++;
  }

  // Plans still missing preferred_cleaner_id — infer from pre-month history
  const { data: activePlans } = await admin
    .from("recurring_bookings")
    .select("id")
    .eq("status", "active")
    .is("preferred_cleaner_id", null);

  for (const plan of activePlans ?? []) {
    const cleanerId = await lastCleanerForPlan(plan.id);
    if (!cleanerId) continue;
    const { error } = await admin
      .from("recurring_bookings")
      .update({ preferred_cleaner_id: cleanerId })
      .eq("id", plan.id);
    if (error) console.error(`Plan ${plan.id} backfill preferred:`, error.message);
    else plansUpdated++;
  }

  const { count: remaining } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("is_recurring_generated", true)
    .gte("date", monthStart)
    .lte("date", monthEnd)
    .eq("status", "pending_assignment")
    .is("cleaner_id", null)
    .not("selected_cleaner_id", "is", null);

  console.log(`Bookings restored to assigned: ${updated}, skipped: ${skipped}.`);
  console.log(`Plans preferred_cleaner_id set/backfilled: ${plansUpdated}.`);
  console.log(`Remaining stuck ${monthArg} recurring (pending_assignment, no cleaner_id): ${remaining ?? 0}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
