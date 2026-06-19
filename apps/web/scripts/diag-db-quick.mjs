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

const inv = await admin.from("monthly_invoices").select("id, month, status", { count: "exact" }).limit(5);
console.log("invoices", inv.error?.message, "count", inv.count);

const bk = await admin.from("bookings").select("id, monthly_invoice_id, payout_status", { count: "exact" }).not("monthly_invoice_id", "is", null).limit(3);
console.log("bookings w invoice count", bk.count);

const el = await admin.from("bookings").select("id, monthly_invoice_id, monthly_invoices(status, month)").eq("payout_status", "eligible").limit(5);
console.log("eligible sample", JSON.stringify(el.data, null, 2));

const byStatus = {};
for (const row of el.data ?? []) {
  const st = row.monthly_invoices?.status ?? "null";
  byStatus[st] = (byStatus[st] ?? 0) + 1;
}
console.log("eligible invoice status sample", byStatus);
