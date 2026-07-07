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

async function countPreJulyPending() {
  const { count } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("status", "completed")
    .eq("is_test", false)
    .lt("date", "2026-07-01")
    .in("payout_status", ["pending", "eligible"]);
  return count ?? 0;
}

async function countJulyPending() {
  const { count } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("status", "completed")
    .eq("is_test", false)
    .gte("date", "2026-07-01")
    .lte("date", "2026-07-31")
    .eq("payout_status", "pending");
  return count ?? 0;
}

const beforePre = await countPreJulyPending();
const beforeJuly = await countJulyPending();
console.log({ beforePreJulyPipeline: beforePre, beforeJulyPending: beforeJuly });

const { data, error } = await admin.rpc("retire_pre_july_pending_cleaner_earnings");
if (error) {
  console.error(
    "RPC retire_pre_july_pending_cleaner_earnings not available yet — apply migration 20261045, then re-run.",
    error.message,
  );
  process.exit(1);
}

console.log({ retired: data });

const afterPre = await countPreJulyPending();
const afterJuly = await countJulyPending();
console.log({ afterPreJulyPipeline: afterPre, afterJulyPending: afterJuly });
