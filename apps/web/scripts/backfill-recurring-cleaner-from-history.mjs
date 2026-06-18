import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, "../.env.local");
const raw = readFileSync(envPath, "utf8");
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const admin = createClient(url, key, { auth: { persistSession: false } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const monthArg = process.argv[2]?.trim() || "2026-06";
const monthStart = `${monthArg}-01`;
const monthEnd = new Date(Number(monthArg.slice(0, 4)), Number(monthArg.slice(5, 7)), 0)
  .toISOString()
  .slice(0, 10);

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
  console.log(`Backfilling cleaner picks for recurring bookings in ${monthArg}…`);

  const { data: plans } = await admin.from("recurring_bookings").select("id").eq("status", "active");
  let updated = 0;
  let skipped = 0;

  for (const plan of plans ?? []) {
    const cleanerId = await lastCleanerForPlan(plan.id);
    if (!cleanerId) {
      skipped++;
      continue;
    }

    const { data: rows } = await admin
      .from("bookings")
      .select("id, selected_cleaner_id, cleaner_id, assignment_type, status")
      .eq("recurring_id", plan.id)
      .eq("is_recurring_generated", true)
      .gte("date", monthStart)
      .lte("date", monthEnd)
      .is("selected_cleaner_id", null)
      .is("cleaner_id", null);

    for (const row of rows ?? []) {
      const st = String(row.status ?? "").toLowerCase();
      const now = new Date().toISOString();
      const patch =
        st === "pending"
          ? {
              selected_cleaner_id: cleanerId,
              cleaner_id: cleanerId,
              assignment_type: "user_selected",
              status: "assigned",
              assigned_at: now,
              cleaner_response_status: "pending",
              dispatch_status: "assigned",
            }
          : {
              selected_cleaner_id: cleanerId,
              assignment_type: "user_selected",
            };

      const { error } = await admin.from("bookings").update(patch).eq("id", row.id);
      if (error) {
        console.error(`Failed ${row.id}:`, error.message);
      } else {
        updated++;
      }
    }
  }

  console.log(`Done. Updated ${updated} booking(s). Plans without prior cleaner: ${skipped}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
