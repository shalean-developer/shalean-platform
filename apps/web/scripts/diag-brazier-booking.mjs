/**
 * Diagnose Edward James Brazier Airbnb booking cleaner selection.
 * Run: node apps/web/scripts/diag-brazier-booking.mjs
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

const { data: bookings, error } = await admin
  .from("bookings")
  .select(
    "id, customer_name, customer_email, service, service_slug, date, time, status, cleaner_id, selected_cleaner_id, assignment_type, dispatch_status, preferred_dispatch_status, attempted_cleaner_id, fallback_reason, booking_snapshot, price_breakdown, created_at, payment_status",
  )
  .or("customer_name.ilike.%Brazier%,customer_email.ilike.%brazier%")
  .order("created_at", { ascending: false })
  .limit(10);

if (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(`Found ${bookings?.length ?? 0} booking(s)\n`);

for (const b of bookings ?? []) {
  const snap = b.booking_snapshot;
  const locked = snap && typeof snap === "object" && "locked" in snap ? snap.locked : null;
  const snapCleanerId =
    snap && typeof snap === "object" && "cleaner_id" in snap ? snap.cleaner_id : null;
  const snapCleanerName =
    snap && typeof snap === "object" && "cleaner_name" in snap ? snap.cleaner_name : null;
  const lockedCleanerId =
    locked && typeof locked === "object" && "cleaner_id" in locked ? locked.cleaner_id : null;

  console.log("=".repeat(60));
  console.log(`${b.customer_name} | ${b.id}`);
  console.log(`Service: ${b.service} (${b.service_slug}) | ${b.date} ${b.time}`);
  console.log(`Status: ${b.status} | payment: ${b.payment_status}`);
  console.log(`cleaner_id: ${b.cleaner_id ?? "null"}`);
  console.log(`selected_cleaner_id: ${b.selected_cleaner_id ?? "null"}`);
  console.log(`assignment_type: ${b.assignment_type ?? "null"}`);
  console.log(`dispatch: ${b.dispatch_status} | preferred: ${b.preferred_dispatch_status}`);
  console.log(`attempted_cleaner_id: ${b.attempted_cleaner_id ?? "null"}`);
  console.log(`fallback_reason: ${b.fallback_reason ?? "null"}`);
  console.log(`snapshot cleaner_id: ${snapCleanerId ?? "null"} | cleaner_name: ${snapCleanerName ?? "null"}`);
  console.log(`locked.cleaner_id: ${lockedCleanerId ?? "null"}`);

  const cleanerIds = [b.cleaner_id, b.selected_cleaner_id, b.attempted_cleaner_id, snapCleanerId, lockedCleanerId]
    .filter((x) => x && String(x).trim())
    .map(String);
  const uniq = [...new Set(cleanerIds)];
  if (uniq.length) {
    const { data: cleaners } = await admin.from("cleaners").select("id, full_name, status").in("id", uniq);
    console.log("Cleaners:", cleaners);
  }

  const { data: offers } = await admin
    .from("dispatch_offers")
    .select("id, cleaner_id, status, created_at, expires_at")
    .eq("booking_id", b.id)
    .order("created_at", { ascending: false });
  console.log(`Dispatch offers (${offers?.length ?? 0}):`, offers);

  const { data: full } = await admin.from("bookings").select("*").eq("id", b.id).maybeSingle();
  if (full) {
    const meta = {
      booking_source: full.booking_source,
      user_id: full.user_id,
      paystack_reference: full.paystack_reference,
      cleaner_mode: full.cleaner_mode,
      cleaner_count: full.cleaner_count,
      pricing_summary: full.pricing_summary,
      service_details: full.service_details,
      selected_extras: full.selected_extras,
      payment_completed_at: full.payment_completed_at,
      created_at: full.created_at,
      booking_snapshot_keys: full.booking_snapshot && typeof full.booking_snapshot === "object" ? Object.keys(full.booking_snapshot) : null,
      booking_snapshot: full.booking_snapshot,
      price_breakdown: full.price_breakdown,
    };
    console.log("Extra:", JSON.stringify(meta, null, 2));
  }
  console.log("");
}

// Analytics around Brazier Airbnb booking
const airbnbId = "5b82af35-022f-43ab-a261-5fc2d1c3e2b1";
const userId = "068a86dc-ab50-445c-9ca9-2ca6a211c857";
const { data: events } = await admin
  .from("user_events")
  .select("event_type, created_at, payload")
  .eq("user_id", userId)
  .gte("created_at", "2026-06-19T08:30:00")
  .lte("created_at", "2026-06-19T08:45:00")
  .order("created_at", { ascending: true });
console.log("=== user_events (Jun 19 08:30-08:45) ===");
for (const e of events ?? []) {
  const p = e.payload && typeof e.payload === "object" ? e.payload : {};
  const cleaner = p.cleaner_id ?? p.best_available_cleaner_id ?? p.selected_cleaner_id ?? null;
  const sel = p.selection_type ?? p.cleaner_mode ?? null;
  console.log(`${e.created_at} ${e.event_type} cleaner=${cleaner} ${sel ? `type=${sel}` : ""}`);
}

const { data: cleanerEvents } = await admin
  .from("user_events")
  .select("event_type, created_at, user_id, payload")
  .eq("event_type", "booking_cleaner_selected")
  .gte("created_at", "2026-06-19T08:30:00")
  .lte("created_at", "2026-06-19T08:45:00")
  .order("created_at", { ascending: true });
console.log("\n=== booking_cleaner_selected (window, all users) ===");
for (const e of cleanerEvents ?? []) {
  const p = e.payload && typeof e.payload === "object" ? e.payload : {};
  console.log(`${e.created_at} user=${e.user_id?.slice(0, 8) ?? "anon"} cleaner=${p.cleaner_id ?? p.best_available_cleaner_id} type=${p.selection_type ?? p.cleaner_mode}`);
}

const { data: payEvents } = await admin
  .from("user_events")
  .select("event_type, created_at, payload")
  .contains("payload", { paystack_reference: "pay_ea32aa07-7f25-4ddc-ad0f-04d82dd5f85b" });
console.log("\n=== events with paystack ref ===", payEvents?.length ?? 0, payEvents);
