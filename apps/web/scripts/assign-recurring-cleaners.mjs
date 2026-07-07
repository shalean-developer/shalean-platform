/**
 * Restore cleaner assignments on recurring generated bookings.
 * Uses selected_cleaner_id, then plan preferred_cleaner_id, then last assigned visit on plan.
 *
 *   node scripts/assign-recurring-cleaners.mjs           # dry-run
 *   node scripts/assign-recurring-cleaners.mjs --apply   # persist
 */
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

const apply = process.argv.includes("--apply");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

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
  const { data: rows, error } = await admin
    .from("bookings")
    .select("id, customer_name, date, status, cleaner_id, selected_cleaner_id, recurring_id, is_monthly_billing_booking")
    .eq("is_recurring_generated", true)
    .is("cleaner_id", null)
    .neq("status", "cancelled")
    .order("date");

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const planCache = new Map();
  let wouldUpdate = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    let cleanerId =
      row.selected_cleaner_id && UUID_RE.test(String(row.selected_cleaner_id))
        ? String(row.selected_cleaner_id)
        : null;

    const planId = row.recurring_id && UUID_RE.test(String(row.recurring_id)) ? String(row.recurring_id) : null;

    if (!cleanerId && planId) {
      if (!planCache.has(planId)) {
        const { data: plan } = await admin
          .from("recurring_bookings")
          .select("preferred_cleaner_id")
          .eq("id", planId)
          .maybeSingle();
        const pref = plan?.preferred_cleaner_id;
        const fromPlan = pref && UUID_RE.test(String(pref)) ? String(pref) : null;
        const fromHistory = fromPlan ?? (await lastCleanerForPlan(planId));
        planCache.set(planId, fromHistory);
      }
      cleanerId = planCache.get(planId) ?? null;
    }

    if (!cleanerId) {
      skipped++;
      console.log(`SKIP ${row.customer_name} ${row.date} — no cleaner source`);
      continue;
    }

    wouldUpdate++;
    const label = `${row.customer_name} ${row.date} (${row.id.slice(0, 8)}) → ${cleanerId.slice(0, 8)}`;
    if (!apply) {
      console.log(`WOULD ASSIGN ${label}`);
      continue;
    }

    const { error: upErr } = await admin.from("bookings").update(restoreAssignedPatch(cleanerId)).eq("id", row.id);
    if (upErr) {
      failed++;
      console.error(`FAIL ${label}:`, upErr.message);
    } else {
      console.log(`ASSIGNED ${label}`);
    }
  }

  if (apply && planCache.size) {
    for (const [planId, cleanerId] of planCache) {
      if (!cleanerId) continue;
      await admin
        .from("recurring_bookings")
        .update({ preferred_cleaner_id: cleanerId })
        .eq("id", planId)
        .is("preferred_cleaner_id", null);
    }
  }

  const { count: remaining } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("is_recurring_generated", true)
    .is("cleaner_id", null)
    .neq("status", "cancelled");

  console.log(
    `\n${apply ? "Updated" : "Would update"} ${wouldUpdate}, skipped ${skipped}, failed ${failed}. Remaining unassigned: ${remaining ?? 0}.`,
  );
  if (!apply && wouldUpdate > 0) console.log("Re-run with --apply to persist.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
