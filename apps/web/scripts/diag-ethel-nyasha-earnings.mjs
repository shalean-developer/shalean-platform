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

const ethel = "914b3acf-40e8-4ad5-a5a2-9e2de711849a";
const nyasha = "796e3ad7-07f3-44eb-b4cf-bed439a59f8b";
const from = "2026-06-01";
const to = "2026-06-19";

const { data: bookingRows } = await admin
  .from("bookings")
  .select(
    "id, date, location, cleaner_id, display_earnings_cents, payout_frozen_cents, cleaner_earnings_total_cents, cleaner_payout_cents, earnings_summary",
  )
  .eq("status", "completed")
  .eq("is_test", false)
  .gte("date", from)
  .lte("date", to)
  .order("date");

const ids = (bookingRows ?? []).map((b) => b.id);
const { data: rosterRows } = await admin
  .from("booking_cleaners")
  .select("booking_id, cleaner_id, role")
  .in("booking_id", ids);

const rosterByBooking = new Map();
for (const r of rosterRows ?? []) {
  const arr = rosterByBooking.get(r.booking_id) ?? [];
  arr.push(r);
  rosterByBooking.set(r.booking_id, arr);
}

function resolveCents(b) {
  const line = b.cleaner_earnings_total_cents;
  if (line != null && line > 0) return line;
  const frozen = b.payout_frozen_cents;
  const display = b.display_earnings_cents;
  if (frozen != null && frozen > 0) return frozen;
  if (frozen === 0 && display != null && display > 0) return display;
  if (frozen != null) return frozen;
  if (display != null) return display;
  return 0;
}

function allocFor(b, roster) {
  const summary = b.earnings_summary;
  const rosterIds = [...new Set((roster ?? []).map((r) => r.cleaner_id).filter(Boolean))];
  const fallback = resolveCents(b);
  const per = summary?.per_cleaner_earnings ?? [];
  if (per.length) {
    const out = [];
    const seen = new Set();
    for (const row of per) {
      if (!row.cleaner_id || seen.has(row.cleaner_id)) continue;
      seen.add(row.cleaner_id);
      out.push({ cleaner_id: row.cleaner_id, cents: row.total_cents ?? 0 });
    }
    for (const cid of rosterIds) {
      if (seen.has(cid)) continue;
      out.push({ cleaner_id: cid, cents: fallback });
    }
    return out;
  }
  if (rosterIds.length) return rosterIds.map((cid) => ({ cleaner_id: cid, cents: fallback }));
  const primary = b.cleaner_id;
  return primary ? [{ cleaner_id: primary, cents: fallback }] : [];
}

const ethelBookings = [];
const nyashaBookings = [];

for (const b of bookingRows ?? []) {
  const roster = rosterByBooking.get(b.id) ?? [];
  const allocs = allocFor(b, roster);
  const e = allocs.find((a) => a.cleaner_id === ethel);
  const n = allocs.find((a) => a.cleaner_id === nyasha);
  if (e) ethelBookings.push({ b, cents: e.cents, roster });
  if (n) nyashaBookings.push({ b, cents: n.cents, roster });
}

console.log("Ethel visits:", ethelBookings.length, "total", ethelBookings.reduce((s, x) => s + x.cents, 0));
console.log("Nyasha visits:", nyashaBookings.length, "total", nyashaBookings.reduce((s, x) => s + x.cents, 0));

console.log("\nEthel bookings:");
for (const { b, cents, roster } of ethelBookings) {
  const per = b.earnings_summary?.per_cleaner_earnings?.map((p) => `${p.cleaner_id.slice(0, 8)}:${p.total_cents}`);
  console.log({
    date: b.date,
    loc: (b.location ?? "").slice(0, 40),
    display: b.display_earnings_cents,
    line_total: b.cleaner_earnings_total_cents,
    frozen: b.payout_frozen_cents,
    alloc: cents,
    per,
    roster: roster.map((r) => `${r.cleaner_id.slice(0, 8)}:${r.role}`),
    withNyasha: roster.some((r) => r.cleaner_id === nyasha),
  });
}

console.log("\nNyasha-only-in-report (not shared with Ethel on same booking):");
for (const { b, cents } of nyashaBookings.filter(({ roster }) => !roster.some((r) => r.cleaner_id === ethel))) {
  console.log({ date: b.date, loc: (b.location ?? "").slice(0, 40), cents });
}
