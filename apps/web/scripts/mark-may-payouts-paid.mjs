/**
 * Mark all May 2026 cleaner_payouts batches as paid; leave June pending.
 * Run: node apps/web/scripts/mark-may-payouts-paid.mjs
 */
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

const MAY_START = "2026-05-01";
const MAY_END = "2026-05-31";
const JUNE_START = "2026-06-01";

const now = new Date().toISOString();

const { data: before } = await admin
  .from("cleaner_payouts")
  .select("id, status, period_start, period_end, total_amount_cents")
  .order("period_end", { ascending: true });

function summarize(rows, label) {
  const by = { pending: 0, approved: 0, paid: 0, frozen: 0, cancelled: 0, other: 0 };
  let mayCents = 0;
  let juneCents = 0;
  for (const r of rows ?? []) {
    const st = String(r.status ?? "").toLowerCase();
    if (st in by) by[st]++;
    else by.other++;
    const cents = Math.round(Number(r.total_amount_cents ?? 0));
    const end = String(r.period_end ?? "");
    if (end >= MAY_START && end <= MAY_END) mayCents += cents;
    if (end >= JUNE_START) juneCents += cents;
  }
  console.log(`${label}:`, by, `May total R ${(mayCents / 100).toFixed(2)}`, `June total R ${(juneCents / 100).toFixed(2)}`);
}

console.log("=== Before ===");
summarize(before, "All batches");

const mayToPay = (before ?? []).filter(
  (p) => String(p.period_end) >= MAY_START && String(p.period_end) <= MAY_END && String(p.status).toLowerCase() !== "paid",
);

console.log(`\nMarking ${mayToPay.length} May batch(es) as paid…`);

if (mayToPay.length === 0) {
  console.log("Nothing to update.");
  process.exit(0);
}

const { data: updated, error } = await admin
  .from("cleaner_payouts")
  .update({
    status: "paid",
    approved_at: now,
    paid_at: now,
  })
  .gte("period_end", MAY_START)
  .lte("period_end", MAY_END)
  .in("status", ["pending", "approved", "frozen"])
  .select("id, period_start, period_end, status, total_amount_cents");

if (error) {
  console.error("Update failed:", error.message);
  process.exit(1);
}

console.log(`Updated ${updated?.length ?? 0} row(s).`);

const { data: after } = await admin
  .from("cleaner_payouts")
  .select("id, status, period_start, period_end, total_amount_cents")
  .order("period_end", { ascending: true });

console.log("\n=== After ===");
summarize(after, "All batches");

const junePending = (after ?? []).filter(
  (p) => String(p.period_end) >= JUNE_START && String(p.status).toLowerCase() === "pending",
);
console.log(`\nJune still pending: ${junePending.length} batch(es)`);
