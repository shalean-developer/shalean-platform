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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeUuidCandidate(value) {
  const s = String(value ?? "").trim();
  return UUID_RE.test(s) ? s : null;
}

function recurringPropagateCleanerOperationalStatus(bookingStatus) {
  const st = String(bookingStatus ?? "").trim().toLowerCase();
  if (st === "pending_payment") return "pending_payment";
  return "pending";
}

function recurringOccurrenceShouldDirectAssign(operationalStatus) {
  const st = String(operationalStatus ?? "").trim().toLowerCase();
  if (!st || st === "pending_payment") return false;
  return ["pending", "pending_assignment", "assigned", "offered", "in_progress"].includes(st);
}

function recurringOccurrenceCleanerPatch(preferredCleanerId, operationalStatus) {
  if (!preferredCleanerId) return {};
  const st = String(operationalStatus ?? "").trim().toLowerCase();
  if (st === "pending_payment") {
    return { selected_cleaner_id: preferredCleanerId, assignment_type: "user_selected", cleaner_id: null };
  }
  if (recurringOccurrenceShouldDirectAssign(st)) {
    const now = new Date().toISOString();
    return {
      selected_cleaner_id: preferredCleanerId,
      cleaner_id: preferredCleanerId,
      assignment_type: "user_selected",
      status: "assigned",
      assigned_at: now,
      cleaner_response_status: "pending",
      dispatch_status: "assigned",
    };
  }
  return { selected_cleaner_id: preferredCleanerId, assignment_type: "user_selected", cleaner_id: null };
}

async function fetchLastAssignedCleanerForRecurringPlan(planId) {
  const { data } = await admin
    .from("bookings")
    .select("cleaner_id, selected_cleaner_id, date")
    .eq("recurring_id", planId)
    .neq("status", "cancelled")
    .order("date", { ascending: false })
    .limit(20);
  for (const row of data ?? []) {
    const c = normalizeUuidCandidate(row.cleaner_id);
    if (c) return c;
    const s = normalizeUuidCandidate(row.selected_cleaner_id);
    if (s) return s;
  }
  return null;
}

async function resolveCleanerForStuckRow(row, planCache) {
  const fromSelected = normalizeUuidCandidate(row.selected_cleaner_id);
  if (fromSelected) return fromSelected;
  const planId = row.recurring_id?.trim();
  if (!planId) return null;
  let plan = planCache.get(planId);
  if (!plan) {
    const { data } = await admin
      .from("recurring_bookings")
      .select("preferred_cleaner_id, booking_snapshot_template")
      .eq("id", planId)
      .maybeSingle();
    plan = {
      preferred_cleaner_id: data?.preferred_cleaner_id ?? null,
      booking_snapshot_template: data?.booking_snapshot_template ?? null,
    };
    planCache.set(planId, plan);
  }
  const fromPlan = normalizeUuidCandidate(plan.preferred_cleaner_id);
  if (fromPlan) return fromPlan;
  return fetchLastAssignedCleanerForRecurringPlan(planId);
}

const fromDate = process.argv[2]?.trim() || "2026-07-01";
const toDate = process.argv[3]?.trim() || "2026-07-31";

let query = admin
  .from("bookings")
  .select("id, recurring_id, selected_cleaner_id, customer_name, status, date")
  .eq("is_recurring_generated", true)
  .is("cleaner_id", null)
  .is("team_id", null)
  .not("status", "in", "(completed,cancelled,failed,payment_expired,pending_payment)")
  .gte("date", fromDate)
  .lte("date", toDate);

const { data: stuckRows, error } = await query.limit(5000);
if (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(`Restoring ${stuckRows?.length ?? 0} stuck recurring bookings (${fromDate} → ${toDate})…`);

let updated = 0;
let skipped = 0;
const planCache = new Map();

for (const row of stuckRows ?? []) {
  const cleanerId = await resolveCleanerForStuckRow(row, planCache);
  if (!cleanerId) {
    skipped++;
    console.log("SKIP", row.customer_name, row.date, "— no cleaner");
    continue;
  }
  const patch = recurringOccurrenceCleanerPatch(cleanerId, recurringPropagateCleanerOperationalStatus(row.status));
  const { error: upErr } = await admin.from("bookings").update(patch).eq("id", row.id);
  if (upErr) {
    skipped++;
    console.error("FAIL", row.id, upErr.message);
    continue;
  }
  updated++;
}

const { count: remaining } = await admin
  .from("bookings")
  .select("id", { count: "exact", head: true })
  .eq("is_recurring_generated", true)
  .is("cleaner_id", null)
  .is("team_id", null)
  .not("status", "in", "(completed,cancelled,failed,payment_expired,pending_payment)")
  .gte("date", fromDate)
  .lte("date", toDate);

console.log(`Done: updated=${updated}, skipped=${skipped}, remaining=${remaining ?? 0}`);
