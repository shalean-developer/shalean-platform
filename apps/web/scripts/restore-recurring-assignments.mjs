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
const TERMINAL = ["completed", "cancelled", "failed", "payment_expired", "pending_payment"];

function normalizeUuid(value) {
  const v = String(value ?? "").trim();
  return UUID_RE.test(v) ? v : null;
}

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
    .order("date", { ascending: false })
    .limit(30);
  for (const row of data ?? []) {
    const c = normalizeUuid(row.cleaner_id);
    if (c) return c;
    const s = normalizeUuid(row.selected_cleaner_id);
    if (s) return s;
  }
  return null;
}

async function resolveCleaner(row, planCache) {
  const fromSelected = normalizeUuid(row.selected_cleaner_id);
  if (fromSelected) return fromSelected;
  if (!row.recurring_id) return null;

  let plan = planCache.get(row.recurring_id);
  if (!plan) {
    const { data } = await admin
      .from("recurring_bookings")
      .select("preferred_cleaner_id")
      .eq("id", row.recurring_id)
      .maybeSingle();
    plan = { preferred_cleaner_id: data?.preferred_cleaner_id ?? null };
    planCache.set(row.recurring_id, plan);
  }

  const fromPlan = normalizeUuid(plan.preferred_cleaner_id);
  if (fromPlan) return fromPlan;
  return lastCleanerForPlan(row.recurring_id);
}

async function main() {
  console.log("Restoring recurring cleaner assignments…");

  const { data: stuckRows, error } = await admin
    .from("bookings")
    .select("id, recurring_id, selected_cleaner_id, customer_name, status")
    .eq("is_recurring_generated", true)
    .is("cleaner_id", null)
    .is("team_id", null)
    .not("status", "in", `(${TERMINAL.join(",")})`)
    .limit(5000);

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  let updated = 0;
  let skipped = 0;
  const planCleaner = new Map();
  const planCache = new Map();

  for (const row of stuckRows ?? []) {
    const cleanerId = await resolveCleaner(row, planCache);
    if (!cleanerId) {
      skipped++;
      continue;
    }

    const { error: updateErr } = await admin.from("bookings").update(restoreAssignedPatch(cleanerId)).eq("id", row.id);
    if (updateErr) {
      console.error(`Failed ${row.id} (${row.customer_name}):`, updateErr.message);
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
    if (!error) plansUpdated++;
  }

  const { count: remaining } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("is_recurring_generated", true)
    .is("cleaner_id", null)
    .is("team_id", null)
    .not("status", "in", `(${TERMINAL.join(",")})`);

  console.log(`Bookings assigned: ${updated}, skipped: ${skipped}, plans updated: ${plansUpdated}.`);
  console.log(`Remaining unassigned recurring: ${remaining ?? 0}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
