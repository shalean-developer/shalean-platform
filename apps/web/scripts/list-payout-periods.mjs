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

const { data: payouts } = await admin
  .from("cleaner_payouts")
  .select("id, cleaner_id, status, period_start, period_end, total_amount_cents")
  .order("period_end", { ascending: false });

const byMonth = {};
for (const p of payouts ?? []) {
  const end = String(p.period_end ?? "").slice(0, 7);
  byMonth[end] = (byMonth[end] ?? 0) + 1;
}
console.log("Payouts by period_end month:", byMonth);
console.log("\nSample rows:");
for (const p of (payouts ?? []).slice(0, 8)) {
  console.log(`${p.period_start} → ${p.period_end} status=${p.status} R${Math.round(Number(p.total_amount_cents) / 100)}`);
}
